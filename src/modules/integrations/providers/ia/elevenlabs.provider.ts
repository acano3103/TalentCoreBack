import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from 'src/prisma/prisma.service';
import { EncryptionService } from 'src/common/utils/encryption.util';

@Injectable()
export class ElevenLabsProvider {
    constructor(
        private prisma: PrismaService,
        private encryptionService: EncryptionService,
    ) { }

    async connect(companyId: number, providerId: number, dto: any) {
        const { apiKey } = dto;

        // Validamos la key contra la API real de ElevenLabs antes de guardarla
        try {
            await axios.get('https://api.elevenlabs.io/v1/user', {
                headers: { 'xi-api-key': apiKey },
            });
        } catch (error) {
            throw new BadRequestException('La API Key de ElevenLabs es inválida o expiró');
        }

        const isConnected = await this.prisma.integraciones.findFirst({
            where: { idEmpresa: companyId, providerId: providerId, isConnected: true },
        });
        if (isConnected) throw new BadRequestException('ElevenLabs ya está conectado');

        await this.prisma.integraciones.create({
            data: {
                idEmpresa: companyId,
                providerId: providerId,
                isConnected: true,
                metadata: {
                    apiKey: this.encryptionService.encrypt(apiKey),
                },
            },
        });

        return { message: 'ElevenLabs conectado exitosamente' };
    }

    async disconnect(companyId: number, providerId: number) {
        try {
            await this.prisma.integraciones.delete({
                where: {
                    idEmpresa_providerId: {
                        idEmpresa: companyId,
                        providerId: providerId,
                    },
                },
            });

            return { message: 'ElevenLabs desconectado exitosamente' };
        } catch (error) {
            throw new BadRequestException('Error al desconectar ElevenLabs');
        }
    }

    async synthesizeSpeech(companyId: number, text: string, voiceId: string): Promise<Buffer> {
        const integracion = await this.prisma.integraciones.findFirst({
            where: {
                idEmpresa: companyId,
                isConnected: true,
                CatIntegracionesProvedores: { code: 'ELEVENLABS' },
            },
        });

        if (!integracion) {
            throw new BadRequestException('ElevenLabs no está configurado o conectado para esta empresa.');
        }

        const metadata = integracion.metadata as any;
        const apiKey = this.encryptionService.decrypt(metadata.apiKey);

        try {
            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
                {
                    text,
                    model_id: 'eleven_multilingual_v2',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                        style: 0.0,
                        use_speaker_boost: true,
                    },
                },
                {
                    headers: {
                        'xi-api-key': apiKey,
                        'Content-Type': 'application/json',
                        Accept: 'audio/mpeg',
                    },
                    responseType: 'arraybuffer',
                },
            );

            return Buffer.from(response.data);
        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            throw new BadRequestException(`Error al generar el audio con ElevenLabs: ${errorMsg}`);
        }
    }
}