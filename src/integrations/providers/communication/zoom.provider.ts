import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConnectIntegrationDto } from 'src/integrations/dto/connect-integration.dto';
import { CommunicationMeetingResponse, ICommunicationProvider } from './interfaces/communication.interface';
import { EncryptionService } from 'src/common/utils/encryption.util';
import { format } from 'date-fns';
import { ProgramInterviewDto } from 'src/interviews/dto/program-interview.dto';

@Injectable()
export class ZoomProvider implements ICommunicationProvider {
    constructor(private prisma: PrismaService, private encryptionService: EncryptionService) { }

    async connect(companyId: number, providerId: number, dto: ConnectIntegrationDto) {
        const { clientId, clientSecret, accountId } = dto;

        try {
            const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
            await axios.post(
                `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
                {},
                {
                    headers: {
                        Authorization: `Basic ${authHeader}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                },
            );
        } catch (error) {
            throw new BadRequestException('Credenciales de Zoom inválidas o cuenta no autorizada');
        }

        const isConnected = await this.prisma.integraciones.findFirst({
            where: {
                idEmpresa: companyId,
                providerId: providerId,
                isConnected: true
            }
        });
        if (isConnected) throw new BadRequestException('Zoom ya está conectado');

        await this.prisma.$transaction(async (tx) => {
            await tx.integraciones.create({
                data: {
                    idEmpresa: companyId,
                    providerId: providerId,
                    isConnected: true,
                    metadata: {
                        clientId: this.encryptionService.encrypt(dto.clientId),
                        clientSecret: this.encryptionService.encrypt(dto.clientSecret),
                        accountId: this.encryptionService.encrypt(dto.accountId)
                    }
                }
            });

            await tx.catIntegracionesProvedores.update({
                where: { id: providerId },
                data: { isConnected: true }
            });
        });

        return { message: 'Zoom conectado exitosamente' };
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

                await tx.catIntegracionesProvedores.update({
                    where: { id: providerId },
                    data: { isConnected: false }
                });
            });

            return { message: 'Zoom desconectado exitosamente' };
        } catch (error) {
            throw new BadRequestException('Error al desconectar Zoom');
        }
    }

    async createMeeting(companyId: number, providerId: number, options: ProgramInterviewDto): Promise<CommunicationMeetingResponse> {
        try {
            const token = await this.getFreshToken(companyId, providerId);
            const localDate = format(new Date(options.scheduledAt), "yyyy-MM-dd'T'HH:mm:ss");

            const response = await axios.post(
                `https://api.zoom.us/v2/users/me/meetings`,
                {
                    topic: options.title,
                    type: 2,
                    start_time: localDate,
                    timezone: 'America/Mexico_City',
                    duration: options.duration,
                    settings: {
                        host_video: true,
                        participant_video: true,
                        join_before_host: false,
                        mute_upon_entry: true,
                        waiting_room: true,
                    },
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                },
            );

            return {
                id: response.data.id.toString(),
                url: response.data.join_url,
                metadata: {
                    meetingId: response.data.id.toString(),
                    joinUrl: response.data.join_url,
                    startUrl: response.data.start_url,
                    password: response.data.password,
                },
            }
        } catch (error) {
            const errorMsg = error.response?.data?.message || error.message;
            throw new BadRequestException(`Error al crear reunión en Zoom: ${errorMsg}`);
        }
    }

    async updateMeeting(data: any) {
    }

    async deleteMeeting(companyId: number, providerId: number, meetingId: string) {
        try {
            const token = await this.getFreshToken(companyId, providerId);

            await axios.delete(
                `https://api.zoom.us/v2/meetings/${meetingId}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    params: {
                        type: 2
                    }
                }
            );

            return { message: 'Meeting eliminada correctamente' };
        } catch (error) {
            const errorMsg = error.response?.data?.message || error.message;
            if (error.response?.status === 404) return { message: 'La meeting ya no existe en Zoom' };
            throw new BadRequestException(`Error al eliminar reunión en Zoom: ${errorMsg}`);
        }
    }

    async getMeeting(meetingId: string) {
    }

    private async getFreshToken(companyId: number, providerId: number) {
        const config = await this.prisma.integraciones.findFirst({
            where: { idEmpresa: companyId, providerId: providerId }
        });

        if (!config?.metadata) throw new BadRequestException('No se encontró configuración de Zoom');
        const { clientId, clientSecret, accountId } = config.metadata as any;
        const decryptedClientId = this.encryptionService.decrypt(clientId);
        const decryptedClientSecret = this.encryptionService.decrypt(clientSecret);
        const decryptedAccountId = this.encryptionService.decrypt(accountId);

        const authHeader = Buffer.from(`${decryptedClientId}:${decryptedClientSecret}`).toString('base64');
        const res = await axios.post(
            `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${decryptedAccountId}`,
            {},
            { headers: { Authorization: `Basic ${authHeader}` } }
        );
        return res.data.access_token;
    }
}