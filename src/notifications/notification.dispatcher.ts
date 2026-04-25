import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { MailProvider } from "./providers/mail/mail.provider";
import { WhatsappProvider } from "./providers/whatsapp/whatsapp.provider";
import { NotificationOptions } from "./interfaces/message.interface";
import { TEMPLATE_MAP } from './maps/template-map';

@Injectable()
export class NotificationDispatcher {
    constructor(
        private readonly prisma: PrismaService,
        private readonly mail: MailProvider,
        private readonly whatsapp: WhatsappProvider
    ) { }

    async notify(options: NotificationOptions) {
        const notificationType = await this.prisma.catTipoNotificacion.findUnique({
            where: { code: options.notificationTypeCode }
        });

        if (!notificationType) {
            throw new Error(`Tipo de notificación no encontrado: ${options.notificationTypeCode}`);
        }

        const notification = await this.prisma.notificaciones.create({
            data: {
                user_uuid: options.userUuid,
                notification_type_id: notificationType.id,
                title: options.subject,
                message: JSON.stringify(options.context),
            }
        });

        const prefs = await this.prisma.preferenciasNotificacionesUsuario.findMany({
            where: {
                user_uuid: options.userUuid,
                enabled: true
            },
            include: {
                CatCanalesNotificaciones: true
            }
        });

        const allowedChannels = await this.prisma.notificacionTipoCanales.findMany({
            where: {
                notification_type_id: notificationType.id,
                enabled: true
            },
            include: {
                CatCanalesNotificaciones: true
            }
        });

        let validChannels;

        if (prefs.length === 0) {
            const DEFAULT_CHANNELS = ['EMAIL', 'WHATSAPP'];
            validChannels = allowedChannels.filter(c => {
                const code = c.CatCanalesNotificaciones?.code;
                return code && DEFAULT_CHANNELS.includes(code);
            });
        } else {
            validChannels = prefs.filter(pref =>
                allowedChannels.some(c => c.channel_id === pref.channel_id)
            );
        }

        const deliveries = await Promise.all(
            validChannels.map(channel =>
                this.prisma.notificacionesEntregas.create({
                    data: {
                        notification_id: notification.id,
                        channel_id: channel.channel_id || channel.id,
                        status: 'PENDING'
                    }
                })
            )
        );

        const providers = {
            EMAIL: this.mail,
            WHATSAPP: this.whatsapp,
        };

        await Promise.all(deliveries.map(async (delivery) => {
            const channel = validChannels.find(c => (c.channel_id || c.id) === delivery.channel_id);

            if (!channel) return;

            const channelCode = channel.CatCanalesNotificaciones.code;
            const provider = providers[channelCode];

            if (!provider) return;

            const template = TEMPLATE_MAP[channelCode]?.[options.notificationTypeCode];
            if (!template) throw new Error(`No template para ${channelCode} - ${options.notificationTypeCode}`);

            try {
                await provider.send(options, template);
                await this.prisma.notificacionesEntregas.update({
                    where: { id: delivery.id },
                    data: {
                        status: 'SENT',
                        sent_at: new Date()
                    }
                });

            } catch (error) {
                await this.prisma.notificacionesEntregas.update({
                    where: { id: delivery.id },
                    data: {
                        status: 'FAILED',
                        error_message: error.message
                    }
                });
            }
        }));
    }
}