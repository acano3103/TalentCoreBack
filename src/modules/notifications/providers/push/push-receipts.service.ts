import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { PushProvider } from './push.provider';

const VENTANA_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PushReceiptsService {
    private readonly logger = new Logger(PushReceiptsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly push: PushProvider,
    ) {}

    @Cron('*/15 * * * *')
    async revisarRecibos(): Promise<void> {
        const canal = await this.prisma.catCanalesNotificaciones.findUnique({ where: { code: 'PUSH' } });
        if (!canal) return;
        const entregas = await this.prisma.notificacionesEntregas.findMany({
            where: {
                channel_id: canal.id,
                status: 'SENT',
                ProveedorMsgId: { not: null },
                sent_at: { gte: new Date(Date.now() - VENTANA_MS) },
            },
            select: { ProveedorMsgId: true },
            take: 1000,
        });
        const ids = [...new Set(entregas.map((entrega) => entrega.ProveedorMsgId).filter((id): id is string => !!id))];
        if (!ids.length) return;
        let recibos: Awaited<ReturnType<PushProvider['recibos']>>;
        try {
            recibos = await this.push.recibos(ids);
        } catch (error) {
            const mensaje = error instanceof Error ? error.message : 'Error al leer recibos de Expo.';
            this.logger.error(mensaje);
            return;
        }
        for (const [ticket, recibo] of Object.entries(recibos)) {
            if (recibo.status !== 'error' || recibo.details?.error !== 'DeviceNotRegistered') continue;
            const tokenDetalle = 'expoPushToken' in (recibo.details ?? {}) ? (recibo.details as { expoPushToken?: string }).expoPushToken : undefined;
            await this.darDeBaja(ticket, tokenDetalle ?? tokenEnMensaje(recibo.message));
        }
    }

    private async darDeBaja(ticket: string, token: string | null): Promise<void> {
        const ahora = new Date();
        const data = { Activo: false, FechaBaja: ahora, MotivoBaja: 'DeviceNotRegistered' };
        const porTicket = await this.prisma.pushTokens.updateMany({
            where: { UltimoTicket: ticket, Activo: true },
            data,
        });
        if (porTicket.count === 0 && token) {
            await this.prisma.pushTokens.updateMany({ where: { Token: token, Activo: true }, data });
        }
        await this.prisma.notificacionesEntregas.updateMany({
            where: { ProveedorMsgId: ticket },
            data: { status: 'FAILED', error_message: 'El dispositivo ya no está registrado.' },
        });
    }
}

function tokenEnMensaje(message: string | undefined): string | null {
    if (!message) return null;
    return /ExponentPushToken\[[^\]]+\]/.exec(message)?.[0] ?? null;
}
