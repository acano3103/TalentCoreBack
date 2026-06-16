import { Injectable, Logger } from '@nestjs/common';
import { NotificationOptions } from '../../interfaces/message.interface';
import { WebsocketGateway } from 'src/notifications/gateways/websockets.gateway';
import { formatNotificationPayload } from 'src/notifications/maps/websocket-map';

@Injectable()
export class WebsocketProvider {
    private readonly logger = new Logger(WebsocketProvider.name);

    constructor(private readonly gateway: WebsocketGateway) { }

    async send(payload: NotificationOptions, template: string) {
        try {
            const typeCode = payload.notificationTypeCode || 'UNKNOWN';
            const ctx = payload.context;

            const { type, message } = formatNotificationPayload(typeCode, ctx, payload.subject);

            this.gateway.sendNotificationToUser(
                payload.userUuid,
                template,
                {
                    id: null,
                    deliveryId: null,
                    title: payload.subject || 'Actualización del Sistema',
                    message: message,
                    type: type,
                    typeCode: typeCode,
                    status: 'SENT',
                    createdAt: new Date(),
                    context: ctx,
                },
            );
        } catch (error) {
            this.logger.error(`Falla en Gateway de Sockets: ${error.message}`);
            throw error;
        }
    }
}