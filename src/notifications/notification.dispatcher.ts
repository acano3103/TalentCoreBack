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
            }
        });

        const validChannels = prefs.filter(pref =>
            allowedChannels.some(c => c.channel_id === pref.channel_id)
        );

        const deliveries = await Promise.all(
            validChannels.map(pref =>
                this.prisma.notificacionesEntregas.create({
                    data: {
                        notification_id: notification.id,
                        channel_id: pref.CatCanalesNotificaciones.id,
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
            const channel = prefs.find(p => p.channel_id === delivery.channel_id)?.CatCanalesNotificaciones.code;
            if (!channel) return;
            const provider = providers[channel];
            if (!provider) return;

            const template = TEMPLATE_MAP[channel]?.[options.notificationTypeCode];
            if (!template) throw new Error(`No template para ${channel} - ${options.notificationTypeCode}`);

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