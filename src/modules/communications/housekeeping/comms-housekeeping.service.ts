import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { AnnouncementDispatchService } from '../delivery/announcement-dispatch.service';
import { DIAS_ENTREGAS, DIAS_NOTIFICACIONES, ESTADOS_ABIERTOS, LOTE_PURGA, restarDias } from './cortes';

export interface ResultadoHousekeeping {
    comunicados: number;
    destinatarios: number;
    notificaciones: number;
    entregas: number;
}

@Injectable()
export class CommsHousekeepingService {
    private readonly logger = new Logger(CommsHousekeepingService.name);
    private ocupado = false;
    private reencolando = false;
    ahora: () => Date = () => new Date();

    constructor(
        private readonly prisma: PrismaService,
        private readonly dispatch?: AnnouncementDispatchService,
    ) {}

    @Cron('* * * * *', { name: 'comms-reencolar-envios' })
    async reencolarEnvios(): Promise<void> {
        if (!this.dispatch || this.reencolando) return;
        this.reencolando = true;
        try {
            const listos = await this.dispatch.reencolarEnviosAtorados(this.ahora());
            if (listos > 0) {
                this.logger.log(`comms-housekeeping: reencoló ${listos} envíos que estaban pendientes.`);
            }
        } catch (error) {
            const texto = error instanceof Error ? error.message : 'Error desconocido';
            this.logger.error(`comms-housekeeping (reencolar): ${texto}`);
        } finally {
            this.reencolando = false;
        }
    }

    @Cron('0 2 * * *', { name: 'comms-housekeeping' })
    async tick(): Promise<void> {
        if (this.ocupado) return;
        this.ocupado = true;
        try {
            const resultado = await this.ejecutar();
            this.logger.log(
                `comms-housekeeping: ${resultado.comunicados} comunicados, ${resultado.destinatarios} destinatarios, ${resultado.notificaciones} notificaciones y ${resultado.entregas} entregas.`,
            );
        } finally {
            this.ocupado = false;
        }
    }

    async ejecutar(): Promise<ResultadoHousekeeping> {
        const ahora = this.ahora();
        const comunicados = (await this.paso('expirar comunicados', () => this.expirarComunicados(ahora))) ?? 0;
        const destinatarios = (await this.paso('expirar destinatarios', () => this.expirarDestinatarios(ahora))) ?? 0;
        const purga = await this.paso('purgar', () => this.purgar(ahora));
        return {
            comunicados,
            destinatarios,
            notificaciones: purga?.notificaciones ?? 0,
            entregas: purga?.entregas ?? 0,
        };
    }

    /** Cambia el estado. No borra comunicados, versiones, destinatarios ni acuses. */
    private async expirarComunicados(ahora: Date): Promise<number> {
        const resultado = await this.prisma.comComunicados.updateMany({
            where: {
                Estado: { in: ['ENVIADO', 'ENVIANDO'] },
                VigenteHasta: { lte: ahora },
            },
            data: { Estado: 'EXPIRADO' },
        });
        return resultado.count;
    }

    private async expirarDestinatarios(ahora: Date): Promise<number> {
        const resultado = await this.prisma.comDestinatarios.updateMany({
            where: {
                Estado: { in: [...ESTADOS_ABIERTOS] },
                ComAcuses: { none: {} },
                ComComunicados: {
                    Estado: 'EXPIRADO',
                    VigenteHasta: { lte: ahora },
                },
            },
            data: { Estado: 'EXPIRADO' },
        });
        return resultado.count;
    }

    private async purgar(ahora: Date): Promise<{ notificaciones: number; entregas: number }> {
        const corteNotif = restarDias(ahora, DIAS_NOTIFICACIONES);
        const corteEntrega = restarDias(ahora, DIAS_ENTREGAS);
        let notificaciones = 0;
        let entregas = 0;
        for (;;) {
            const filas = await this.prisma.notificaciones.findMany({
                where: { created_at: { lt: corteNotif } },
                select: { id: true },
                take: LOTE_PURGA,
            });
            if (!filas.length) break;
            const ids = filas.map((fila) => fila.id);
            const hijas = await this.prisma.notificacionesEntregas.deleteMany({
                where: { notification_id: { in: ids } },
            });
            entregas += hijas.count;
            const padres = await this.prisma.notificaciones.deleteMany({ where: { id: { in: ids } } });
            notificaciones += padres.count;
            if (padres.count === 0 || filas.length < LOTE_PURGA) break;
        }
        const viejas = await this.prisma.notificacionesEntregas.deleteMany({
            where: { sent_at: { lt: corteEntrega } },
        });
        entregas += viejas.count;
        return { notificaciones, entregas };
    }

    private async paso<T>(nombre: string, tarea: () => Promise<T>): Promise<T | null> {
        try {
            return await tarea();
        } catch (error) {
            const texto = error instanceof Error ? error.message : 'Error desconocido';
            this.logger.error(`comms-housekeeping (${nombre}): ${texto}`);
            return null;
        }
    }
}
