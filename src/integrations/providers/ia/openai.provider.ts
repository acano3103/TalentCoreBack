import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from 'src/prisma/prisma.service';
import { EncryptionService } from 'src/common/utils/encryption.util';
import { IAiProvider } from './interfaces/openai.interface';

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

    async analyzeCV(pdfBuffer: Buffer, options?: any) {
        // 1. Desencriptar la API key de la BD
        // 2. Enviar el buffer/texto a OpenAI con tu prompt estructurado
        // 3. Retornar el JSON mapeado
    }
}