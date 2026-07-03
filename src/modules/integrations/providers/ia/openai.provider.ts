import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from 'src/prisma/prisma.service';
import { EncryptionService } from 'src/common/utils/encryption.util';
import { IAiProvider } from './interfaces/ai.interface';

@Injectable()
export class OpenAiProvider implements IAiProvider {
    constructor(
        private prisma: PrismaService,
        private encryptionService: EncryptionService
    ) { }

    async connect(companyId: number, providerId: number, dto: any) {
        const { apiKey, defaultModel } = dto;

        try {
            await axios.get('https://api.openai.com/v1/models', {
                headers: { Authorization: `Bearer ${apiKey}` }
            });
        } catch (error) {
            throw new BadRequestException('La API Key de OpenAI es inválida o expiró');
        }

        const isConnected = await this.prisma.integraciones.findFirst({
            where: { idEmpresa: companyId, providerId: providerId, isConnected: true }
        });
        if (isConnected) throw new BadRequestException('OpenAI ya está conectado');

        await this.prisma.$transaction(async (tx) => {
            await tx.integraciones.create({
                data: {
                    idEmpresa: companyId,
                    providerId: providerId,
                    isConnected: true,
                    metadata: {
                        apiKey: this.encryptionService.encrypt(apiKey),
                        defaultModel: defaultModel || 'gpt-4o'
                    }
                }
            });
        });

        return { message: 'OpenAI conectado exitosamente' };
    }

    async disconnect(companyId: number, providerId: number) {
        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.integraciones.delete({
                    where: {
                        idEmpresa_providerId: {
                            idEmpresa: companyId,
                            providerId: providerId
                        }
                    }
                });
            });

            return { message: 'OpenAI desconectado exitosamente' };
        } catch (error) {
            throw new BadRequestException('Error al desconectar OpenAI');
        }
    }

    async generateJobDescription(companyId: number, requirements: any): Promise<string> {
        const integracion = await this.prisma.integraciones.findFirst({
            where: {
                idEmpresa: companyId,
                isConnected: true,
                CatIntegracionesProvedores: {
                    code: 'OPENAI'
                }
            },
            include: { CatIntegracionesProvedores: true }
        });

        if (!integracion) throw new BadRequestException('OpenAI no está configurado o conectado para esta empresa.');

        // Desencriptar las credenciales
        const metadata = integracion.metadata as any;
        const apiKey = this.encryptionService.decrypt(metadata.apiKey);
        const model = metadata.defaultModel || 'gpt-4o';

        // Crear el mensaje del prompt basado en tu JSON anidado
        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: model,
                    messages: [
                        {
                            role: 'system',
                            content: `Eres un experto en Reclutamiento y Selección de Talento Humano. 
                            Tu tarea es redactar una descripción de puesto/vacante altamente atractiva y profesional para ser publicada en bolsas de trabajo.
                            Utiliza un tono corporativo pero moderno. Estructura el resultado usando secciones claras(por ejemplo: Sobre el Puesto, Responsabilidades, Requisitos).
                            No agregues saludos ni comentarios extras, regresa únicamente el texto estructurado de la vacante.`
                        },
                        {
                            role: 'user',
                            content: `Genera la descripción de la vacante utilizando los siguientes datos estructurados del puesto:
                            ${JSON.stringify(requirements, null, 2)}`
                        }
                    ],
                    temperature: 0.7
                },
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Retornar el texto generado por la IA
            return response.data.choices[0].message.content;

        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            throw new BadRequestException(`Error al generar la vacante con OpenAI: ${errorMsg}`);
        }
    }

    async analyzeCV(pdfBuffer: Buffer, options?: any) {
        // 1. Desencriptar la API key de la BD
        // 2. Enviar el buffer/texto a OpenAI con tu prompt estructurado
        // 3. Retornar el JSON mapeado
    }
}