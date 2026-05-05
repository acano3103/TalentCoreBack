import {
    Injectable,
    InternalServerErrorException,
    BadRequestException,
    NotFoundException,
    Logger
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { lastValueFrom } from 'rxjs';
import { HumeEviConfigBody } from './interfaces/hume.interface';
import { saveFileLocal } from 'src/common/utils/file-storage.util';
import { analyzeInterviewWithOpenAI } from 'src/common/utils/openai-eval.util';

@Injectable()
export class HumeService {
    private readonly logger = new Logger(HumeService.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
    ) { }

    async getHumeSession(interviewId: string) {
        if (!interviewId) {
            throw new BadRequestException('El interviewId es requerido');
        }

        // 1. Validar en la tabla correcta: entrevistasPostulantes
        const interview = await this.prisma.entrevistasPostulantes.findUnique({
            where: { id: interviewId },
            include: { Entrevistas: true }
        });
        if (!interview || !interview.Entrevistas || !interview.Entrevistas.agent_id) throw new NotFoundException('La entrevista no existe');
        const agent = await this.prisma.agentes.findUnique({ where: { id: interview.Entrevistas.agent_id } });
        if (!agent) throw new NotFoundException('El agente no existe');


        // 2. Validar estado (status_id === 1 es el activo/programado)
        if (interview.status_id !== 1) {
            throw new BadRequestException('La entrevista ya no está disponible o ha finalizado');
        }

        // 3. Obtener el Access Token
        const accessToken = await this.fetchHumeToken();

        // 4. Obtener el Config ID del entorno (tal cual la versión base)
        const configId = agent.humeConfigId

        if (!configId) {
            throw new BadRequestException('No se encontró un configId válido para Hume (HUME_CONFIG_ID_INTERVIEW)');
        }

        return {
            accessToken,
            configId,
        };
    }

    private async fetchHumeToken(): Promise<string> {
        const apiKey = this.configService.get<string>('HUME_API_KEY');
        const secretKey = this.configService.get<string>('HUME_SECRET_KEY');

        if (!apiKey || !secretKey) {
            throw new InternalServerErrorException('Faltan credenciales de Hume en el servidor (.env)');
        }

        const authString = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');

        try {
            const response = await lastValueFrom(
                this.httpService.post(
                    'https://api.hume.ai/oauth2-cc/token', // URL Corregida según versión base
                    'grant_type=client_credentials',
                    {
                        headers: {
                            'Authorization': `Basic ${authString}`,
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                    },
                ),
            );

            if (!response.data.access_token) {
                throw new Error('Respuesta de Hume no contiene access_token');
            }

            return response.data.access_token;
        } catch (error) {
            this.logger.error(`Error Hume API Auth: ${error.response?.status} - ${JSON.stringify(error.response?.data || error.message)}`);
            throw new InternalServerErrorException('Error al conectar con el servicio de autenticación de Hume AI');
        }
    }

    async createConfig(name: string, systemPrompt: string): Promise<string> {
        const apiKey = this.configService.get<string>('HUME_API_KEY');

        const body: HumeEviConfigBody = {
            name: name,
            evi_version: '2', // O la versión que soporte tu tier actual
            prompt: { text: systemPrompt },
            language_model: {
                model_provider: 'OPEN_AI',
                model_resource: 'gpt-4o-mini',
            },
        };

        try {
            const response = await lastValueFrom(
                this.httpService.post(
                    'https://api.hume.ai/v0/evi/configs',
                    body,
                    {
                        headers: {
                            'X-Hume-Api-Key': apiKey, // Para crear configs se usa X-Hume-Api-Key
                            'Content-Type': 'application/json',
                        },
                    },
                ),
            );

            return response.data.id; // Este es el ID que guardaremos en la DB
        } catch (error) {
            console.error('Error al crear config en Hume:', error.response?.data || error.message);
            throw new InternalServerErrorException('No se pudo registrar la configuración en Hume AI');
        }
    }

    async processHumeAnalysis(interviewId: string, video?: Express.Multer.File, historyRaw?: string, emotionsRaw?: string) {

        const interview = await this.prisma.entrevistasPostulantes.findUnique({ where: { id: interviewId } });
        if (!interview) throw new NotFoundException('Entrevista no encontrada');
        if (interview.status_id !== 1) throw new BadRequestException('La entrevista ya se ha realizado o cancelado');

        let videoUrl = '';
        if (video) videoUrl = await saveFileLocal(video, 'recordings', `${interviewId}-video.webm`);

        const parsedHistory = historyRaw ? JSON.parse(historyRaw) : [];
        const parsedEmotions = emotionsRaw ? JSON.parse(emotionsRaw) : [];

        const transcription = parsedHistory
            .map(msg => `${msg.role === 'user' ? 'Candidato' : 'Entrevistador'}: ${msg.content}`)
            .join('\n');

        const mainInterview = await this.prisma.entrevistas.findFirst({
            where: { id: interview.interview_id },
            include: { EntrevistasCriterios: true }
        })
        if (!mainInterview || !mainInterview.agent_id || !mainInterview.position_id) throw new NotFoundException('Entrevista de catalogo no encontrada');
        const agent = await this.prisma.agentes.findFirst({ where: { id: mainInterview.agent_id } })
        if (!agent || !agent.script) throw new NotFoundException('Agente no encontrado');
        const position = await this.prisma.catPuestos.findFirst({ where: { idPuesto: mainInterview.position_id } })
        if (!position) throw new NotFoundException('Puesto no encontrado');
        const requirements = await this.prisma.competenciasPuesto.findMany({ where: { idPuesto: mainInterview.position_id } })

        const evaluation = await analyzeInterviewWithOpenAI(
            this.configService.get<string>('OPENAI_API_KEY')!,
            position.NombrePuesto,
            position.DescripcionPuesto || "",
            requirements.map(r => r.Competencia).join(", "),
            agent.script,
            agent.min_score || 70,
            0, // Puedes calcular duración restando fechas si las tienes en BD
            mainInterview.EntrevistasCriterios,
            transcription,
            parsedHistory
        );

        // 6. Guardar todo en Prisma (Entrevista + Evaluación)
        return await this.prisma.$transaction(async (tx) => {
            // Actualizar estado de la entrevista
            await tx.entrevistasPostulantes.update({
                where: { id: interviewId },
                data: {
                    status_id: 2,
                    metadata: {
                        videoUrl: videoUrl || null,
                        transcription: transcription || null,
                    },
                }
            });

            // Actualizamos la evaluación detallada
            await tx.entrevistasResultados.update({
                where: { interview_postulant_id: interviewId },
                data: {
                    final_score: evaluation.overallScore,
                    general_report: evaluation.recruiterReport,
                    strengths: evaluation.strengths,
                    improvement_areas: evaluation.areasForImprovement,
                    recommendations: evaluation.recommendations,
                    metadata: {
                        conversationHistory: parsedHistory || null,
                        emotionData: parsedEmotions || null,
                        isApt: evaluation.isApt,
                        candidateSummary: evaluation.candidateSummary,
                    },
                }
            });

            // ACtualizamos los criterios de la entrevista
            for (const criterion of evaluation.criterionScores) {
                await tx.entrevistaCriteriosEvaluacion.update({
                    where: { criterio_id: criterion.criterionId },
                    data: {
                        score: criterion.points,
                        comment: criterion.feedback
                    }
                });
            }

            return 'Entrevista guardada exitosamente';
        });
    }
}