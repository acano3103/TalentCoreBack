import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { IntegrationsFactory } from '../integrations/providers/factory.service';
import { NotificationDispatcher } from 'src/notifications/notification.dispatcher';
import { quotePlus } from 'src/common/utils/address.utils';
import { formatDate, formatHour } from 'src/common/utils/time.utils';
import { findAllInterviews, findAllInterviewsByPostulant, findInterviewDetail, findProgrammedInterviews } from './queries/interviews.queries';
import { ProgramInterviewDto } from './dto/program-interview.dto';
import { calculateFinalScore } from './utils/calculate-final-score';
import { UpdateMeetingDto } from './dto/update-interview.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InterviewsService {
    constructor(
        private readonly configService: ConfigService,
        private prisma: PrismaService,
        private integrationsFactory: IntegrationsFactory,
        private readonly notifications: NotificationDispatcher
    ) { }

    private readonly logger = new Logger(InterviewsService.name);

    async findAll(companyId: number, positionId?: number) {
        return await findAllInterviews(companyId, positionId, this.prisma);
    }

    async findProgrammedInterviews(companyId: number, mainInterviewId: string) {
        return await findProgrammedInterviews(companyId, mainInterviewId, this.prisma);
    }

    async findActivePositions(companyId: number) {
        const activePositions = await this.prisma.catPuestos.findMany({
            where: {
                idEmpresa: companyId,
                aprobada: true,
                Activo: true
            },
            select: {
                idPuesto: true,
                NombrePuesto: true,
            }
        });
        return activePositions;
    }

    async create(companyId: number, dto: CreateInterviewDto) {
        const interviews = await Promise.all(
            dto.positionIds.map(positionId =>
                this.prisma.entrevistas.create({
                    data: {
                        company_id: companyId,
                        area_id: dto.areaId,
                        idVacante: positionId,
                        provider_id: dto.providerId,
                        agent_id: dto.agentId || null,
                        description: dto.description || null,
                        interview_type: dto.interviewType,
                        modality: dto.modality,
                        title: dto.title,
                        duration: dto.duration,
                        interviewer_name: dto.interviewerName,
                        location: dto.locationAddress || null,
                        comment: dto.comment || null,
                        EntrevistasCriterios: {
                            create: dto.criteria.map((criterion, index) => ({
                                name: criterion.name,
                                description: criterion.description || '',
                                max_score: criterion.weight || 0,
                                weight: criterion.weight || 1,
                                order: criterion.order || index + 1,
                                CriterioPreguntas: criterion.questions?.length
                                    ? {
                                        create: criterion.questions.map(q => ({
                                            question: q.question,
                                            expected_answer: q.expectedAnswer || null,
                                            order: q.order || null,
                                        })),
                                    }
                                    : undefined,
                            })),
                        },
                    },
                })
            )
        );

        return { message: 'Entrevistas creadas exitosamente', total: interviews.length };
    }

    async programInterview(companyId: number, interviewId: string, dto: ProgramInterviewDto) {
        const mainInterview = await this.prisma.entrevistas.findFirst({
            where: { id: interviewId },
            include: { EntrevistasCriterios: true }
        })
        if (!mainInterview) throw new BadRequestException('No se encontró la entrevista principal')

        const postulant = await this.prisma.postulaciones.findFirst({ where: { idPostulacion: dto.postulantId } })
        if (!postulant) throw new BadRequestException('No se encontró el postulante')

        let meetingData: any = { id: null, interviewId: null, url: null, metadata: null };
        try {
            dto.duration = mainInterview.duration || 60;
            dto.title = mainInterview.title || 'Entrevista'
            if (mainInterview.interview_type === 'PERSONA' && mainInterview.modality === 'ONLINE') {
                const zoomProvider = await this.integrationsFactory.getProvider(mainInterview.provider_id);
                meetingData = await zoomProvider.createMeeting(companyId, mainInterview.provider_id, dto);
            }

            await this.prisma.$transaction(async (tx) => {
                const interview = await tx.entrevistasPostulantes.create({
                    data: {
                        candidate_uuid: postulant.uuid,
                        interview_id: mainInterview.id,
                        scheduled_at: new Date(dto.scheduledAt),
                        duration: dto.duration,
                        meeting_id: meetingData?.id || null,
                        meeting_url: meetingData?.url || null,
                        location: mainInterview.location || null,
                        metadata: meetingData?.metadata || null,
                        EntrevistaCriteriosEvaluacion: {
                            create: mainInterview.EntrevistasCriterios.map((criterio) => ({
                                criterio_id: criterio.id
                            }))
                        },
                        EntrevistasResultados: {
                            create: {}
                        }
                    }
                });
                meetingData.interviewId = interview.id;

                await tx.postulaciones.update({
                    where: { idPostulacion: dto.postulantId },
                    data: { idEstatus: 2 }
                })

                if (mainInterview.interview_type == 'IA') {
                    meetingData.url = `${this.configService.get<string>('FRONT_URL')}/entrevista/${interview.id}`;
                    await tx.entrevistasPostulantes.update({
                        where: { id: interview.id },
                        data: { meeting_url: meetingData.url, meeting_id: interview.id }
                    })
                }
            });

            const date = new Date(dto.scheduledAt);
            const day = formatDate(date);
            const hour = formatHour(date);

            let map_link: string | null = null;
            let map_img: string | null = null;
            let lugar_mostrado = mainInterview.location;

            if (mainInterview.location && !meetingData?.url) {
                const q = quotePlus(mainInterview.location.trim());
                map_link = `https://www.google.com/maps/search/?api=1&query=${q}`;
                map_img = `https://staticmap.openstreetmap.de/staticmap.php?center=${q}&zoom=16&size=600x300&markers=${q},red-pushpin`;
            }

            await this.notifications.notify({
                userUuid: postulant.uuid,
                notificationTypeCode: 'INTERVIEW_SCHEDULED',
                to: postulant.correo,
                phone: postulant.telefono,
                subject: mainInterview.title || '',
                context: {
                    nombre: `${postulant.nombre} ${postulant.primerApellido}`,
                    entrevistasNombre: mainInterview.title || '',
                    dia: day,
                    hora: hour,
                    lugar: lugar_mostrado,
                    liga: meetingData?.url,
                    map_link: map_link,
                    map_img: map_img,
                    comentarios: mainInterview.comment,
                }
            });

            return { message: 'Entrevista creada exitosamente' };
        } catch (error) {
            this.logger.error('Error creating interview', error);
            const provider = await this.integrationsFactory.getProvider(mainInterview.provider_id);
            if (provider) await provider.deleteMeeting(companyId, mainInterview.provider_id, meetingData?.id);

            throw new BadRequestException('Error al crear entrevista');
        }

    }

    async findAllByPostulant(companyId: number, postulantId: number) {
        const postulant = await this.prisma.postulaciones.findFirst({
            where: { idPostulacion: postulantId }
        })
        if (!postulant) throw new BadRequestException('No se encontró el postulante');

        return await findAllInterviewsByPostulant(postulant.uuid, this.prisma);
    }

    async getMeetingDetail(companyId: number, interviewId: string) {
        return await findInterviewDetail(interviewId, this.prisma);
    }

    async updateMeeting(companyId: number, meetingId: string, dto: UpdateMeetingDto) {
        const interviewPostulant = await this.prisma.entrevistasPostulantes.findFirst({
            where: { id: meetingId },
            include: {
                EntrevistasResultados: true,
                EntrevistaCriteriosEvaluacion: {
                    include: {
                        EntrevistasCriterios: true
                    }
                },
            }
        })
        if (!interviewPostulant) throw new BadRequestException('No se encontró la entrevista');

        let finalScore: number | null = null;
        if (dto.statusId === 2) {
            finalScore = calculateFinalScore(
                interviewPostulant.EntrevistaCriteriosEvaluacion
            );
        }

        await this.prisma.entrevistasPostulantes.update({
            where: { id: meetingId },
            data: {
                status_id: dto.statusId,
                EntrevistasResultados: {
                    update: {
                        final_score: finalScore,
                        general_report: dto.generalReport,
                        strengths: dto.strengths,
                        improvement_areas: dto.improvementAreas,
                        recommendations: dto.recomendations,
                    }
                },
                EntrevistaCriteriosEvaluacion: {
                    update: dto.criteria?.map((criterio: any) => ({
                        where: { id: criterio.criterionId },
                        data: {
                            score: criterio.score,
                            comment: criterio.comments,
                        }
                    }))
                }
            }
        })
        return { message: 'Entrevista actualizada exitosamente' };
    }

    async getStatus(companyId: number) {
        const status = await this.prisma.catEstatusEntrevista.findMany({
            where: { activo: true },
            select: {
                idEstatusEntrevista: true,
                descripcion: true
            }
        });

        return status.map(s => ({
            id: s.idEstatusEntrevista,
            description: s.descripcion
        }));
    }

}