import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { formatNotificationPayload } from './maps/websocket-map';

@Injectable()
export class NotificationsService {
    constructor(private readonly prisma: PrismaService) { }

    async getUserNotifications(userUuid: string, limit?: number, onlyUnread = false) {
        const notifications = await this.prisma.notificaciones.findMany({
            where: {
                user_uuid: userUuid,
                NotificacionesEntregas: {
                    some: {
                        channel_id: 4,
                        ...(onlyUnread && { status: 'SENT' }),
                    },
                },
            },
            include: {
                CatTipoNotificacion: true,
                NotificacionesEntregas: {
                    where: { channel_id: 4 },
                },
            },
            orderBy: { created_at: 'desc' },
            ...(limit && { take: limit }),
        });

        return notifications.map((n) => {
            const entregas = n.NotificacionesEntregas || (n as any).notificacionesEntregas || [];
            const entregaPlatform = entregas[0];

            let parsedContext: any = {};
            try {
                parsedContext = JSON.parse(n.message ?? '{}');
            } catch (e) {
                parsedContext = {};
            }

            const typeCode = n.CatTipoNotificacion?.code || 'UNKNOWN';

            const { type, message } = formatNotificationPayload(
                typeCode,
                parsedContext,
                n.title ?? undefined
            );

            return {
                id: n.id,
                deliveryId: entregaPlatform?.id || null,
                title: n.title,
                message: message,
                type: type,
                typeCode: typeCode,
                status: entregaPlatform?.status || 'SENT',
                createdAt: n.created_at,
                context: parsedContext,
            };
        });
    }

    async markAsRead(deliveryId: string) {
        return await this.prisma.notificacionesEntregas.update({
            where: { id: deliveryId },
            data: { status: 'READ' },
        });
    }

    async markAllAsRead(userUuid: string) {
        return await this.prisma.notificacionesEntregas.updateMany({
            where: {
                channel_id: 4,
                status: 'SENT',
                Notificaciones: {
                    user_uuid: userUuid,
                },
            },
            data: { status: 'READ' },
        });
    }
}