import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { WebsocketGateway } from './gateways/websockets.gateway';
import { armarConteo, ConteoCampana, whereNoLeidas } from './campana';

export interface AvisoCampana {
    id: string;
    titulo: string;
    mensaje: string;
    categoria: string | null;
    prioridad: string;
    deepLink: string | null;
    creadoEn: Date;
    leida: boolean;
}

@Injectable()
export class CampanaRealtimeService {
    private readonly logger = new Logger(CampanaRealtimeService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly gateway: WebsocketGateway,
    ) {}

    async conteo(userUuid: string, companyId: number | null, idTenant: number | null, ahora = new Date()): Promise<ConteoCampana> {
        const filas = await this.prisma.notificaciones.findMany({
            where: whereNoLeidas({ userUuid, companyId, idTenant, ahora }),
            select: { Categoria: true },
        });
        return armarConteo(companyId, filas.map((fila) => fila.Categoria));
    }

    /** Emite la campana. Un fallo de socket no deshace la notificación ya guardada. */
    async publicar(
        userUuid: string,
        companyId: number | null,
        idTenant: number | null,
        aviso?: AvisoCampana,
    ): Promise<void> {
        try {
            if (aviso) this.gateway.sendNotificationToUser(userUuid, 'notifications:new', aviso);
            const conteo = await this.conteo(userUuid, companyId, idTenant);
            this.gateway.sendNotificationToUser(userUuid, 'notifications:count', conteo);
        } catch (error) {
            const mensaje = error instanceof Error ? error.message : 'error';
            this.logger.warn(`No se pudo actualizar la campana de ${userUuid}: ${mensaje}`);
        }
    }
}
