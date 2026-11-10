import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
    namespace: '/ws',
    cors: {
        origin: '*',
    },
})

export class WebsocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;
    private readonly logger = new Logger(WebsocketGateway.name);

    afterInit(server: Server) {
        this.logger.log('🌐 Servidor de Sockets Iniciado - Namespace: /ws');
    }

    handleConnection(client: Socket) {
        const userUuid = client.handshake.query.userUuid as string;

        if (!userUuid) {
            this.logger.warn(`Conexión rechazada: Socket ${client.id} no envió userUuid`);
            client.disconnect();
            return;
        }

        client.join(userUuid);
    }

    handleDisconnect(client: Socket) { }

    sendNotificationToUser(userUuid: string, eventName: string, payload: any) {
        this.server.to(userUuid).emit(eventName, payload);
    }
}