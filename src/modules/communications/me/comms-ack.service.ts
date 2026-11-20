import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { WebsocketGateway } from 'src/modules/notifications/gateways/websockets.gateway';
import { PrismaService } from 'src/prisma/prisma.service';
import { errorComms, esP2002 } from '../comms-http';
import { esVigente } from './bandeja';

const TRANSACCION = { maxWait: 15_000, timeout: 60_000 };
const ZONA_DEFAULT = 'America/Mexico_City';

export type CanalAcuse = 'APP' | 'WEB' | 'ENLACE' | 'KIOSCO';

export interface EntradaAcuse {
    companyId: number;
    idTenant: number;
    idComunicado: number;
    idEmpleado: number;
    canal: CanalAcuse;
    metodo: string;
    ip: string | null;
    userAgent: string | null;
    dispositivo: string | null;
    zonaHoraria: string;
}

export interface ResultadoAcuse {
    confirmadoEn: Date;
    version: number;
    canal: CanalAcuse;
}

@Injectable()
export class CommsAckService {
    private readonly logger = new Logger(CommsAckService.name);
    ahora: () => Date = () => new Date();

    constructor(
        private readonly prisma: PrismaService,
        private readonly gateway: WebsocketGateway,
    ) {}

    async confirmar(entrada: EntradaAcuse): Promise<ResultadoAcuse> {
        const dest = await this.prisma.comDestinatarios.findFirst({
            where: { idComunicado: entrada.idComunicado, idEmpleado: entrada.idEmpleado },
            include: { ComComunicados: true },
        });
        const comunicado = dest?.ComComunicados;
        if (!dest || !comunicado || comunicado.idEmpresa !== entrada.companyId || comunicado.idTenant !== entrada.idTenant) {
            throw errorComms(HttpStatus.NOT_FOUND, 'NO_DESTINATARIO', 'No eres destinatario de este comunicado.');
        }
        if (comunicado.AcuseModo === 'NINGUNO') {
            throw errorComms(HttpStatus.CONFLICT, 'ACUSE_NO_REQUERIDO', 'Este comunicado no pide confirmación.');
        }
        if (!esVigente(comunicado.Estado, comunicado.VigenteHasta, this.ahora())) {
            throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'Este comunicado ya no admite confirmación.');
        }

        const version = await this.prisma.comComunicadoVersiones.findUnique({
            where: { idComunicado_NumVersion: { idComunicado: comunicado.idComunicado, NumVersion: comunicado.VersionActual } },
        });
        if (!version || version.NumVersion !== comunicado.VersionActual) {
            throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'La confirmación solo aplica a la versión vigente.');
        }

        const ahora = this.ahora();
        try {
            const resultado = await this.prisma.$transaction(async (tx) => {
                const ya = await tx.comAcuses.findFirst({
                    where: { idDestinatario: dest.idDestinatario, idVersion: version.idVersion },
                });
                if (ya) {
                    const alDia = dest.Estado === 'CONFIRMADO' && dest.VersionConfirmada === version.NumVersion;
                    if (!alDia) await this.marcarConfirmado(tx, dest.idDestinatario, dest.ConfirmadoEn ?? ya.FechaUtc, version.NumVersion);
                    return { confirmadoEn: dest.ConfirmadoEn ?? ya.FechaUtc, version: version.NumVersion, canal: comoCanal(ya.Canal), nuevo: !alDia };
                }
                const creado = await tx.comAcuses.create({
                    data: {
                        idComunicado: comunicado.idComunicado,
                        idVersion: version.idVersion,
                        idDestinatario: dest.idDestinatario,
                        idEmpleado: entrada.idEmpleado,
                        FechaUtc: ahora,
                        ZonaHoraria: recortar(entrada.zonaHoraria || ZONA_DEFAULT, 50) || ZONA_DEFAULT,
                        Canal: entrada.canal,
                        Metodo: recortar(entrada.metodo, 40) || 'SESION',
                        Ip: recortar(entrada.ip, 45),
                        UserAgent: recortar(entrada.userAgent, 300),
                        Dispositivo: recortar(entrada.dispositivo, 120),
                    },
                });
                await this.marcarConfirmado(tx, dest.idDestinatario, ahora, version.NumVersion);
                return { confirmadoEn: creado.FechaUtc, version: version.NumVersion, canal: entrada.canal, nuevo: true };
            }, TRANSACCION);
            if (resultado.nuevo) {
                await this.emitir(comunicado.idComunicado, comunicado.CreadoPor, version.NumVersion, comunicado.TotalDestinatarios);
            }
            return { confirmadoEn: resultado.confirmadoEn, version: resultado.version, canal: resultado.canal };
        } catch (error) {
            if (!esP2002(error)) throw error;
            const ya = await this.prisma.comAcuses.findFirst({
                where: { idDestinatario: dest.idDestinatario, idVersion: version.idVersion },
            });
            if (!ya) throw error;
            return { confirmadoEn: ya.FechaUtc, version: version.NumVersion, canal: comoCanal(ya.Canal) };
        }
    }

    private async marcarConfirmado(
        tx: Prisma.TransactionClient,
        idDestinatario: number,
        confirmadoEn: Date,
        version: number,
    ): Promise<void> {
        await tx.comDestinatarios.update({
            where: { idDestinatario },
            data: { Estado: 'CONFIRMADO', ConfirmadoEn: confirmadoEn, VersionConfirmada: version },
        });
    }

    private async emitir(idComunicado: number, creadoPor: string, version: number, total: number): Promise<void> {
        if (!creadoPor) return;
        const confirmados = await this.prisma.comDestinatarios.count({
            where: { idComunicado, Estado: 'CONFIRMADO', VersionConfirmada: version },
        });
        try {
            this.gateway.sendNotificationToUser(creadoPor, 'comms:ack', { idComunicado, confirmados, total, version });
        } catch (error) {
            const mensaje = error instanceof Error ? error.message : 'error';
            this.logger.warn(`No se emitió el acuse del comunicado ${idComunicado}: ${mensaje}`);
        }
    }
}

function comoCanal(valor: string): CanalAcuse {
    if (valor === 'APP' || valor === 'WEB' || valor === 'ENLACE' || valor === 'KIOSCO') return valor;
    return 'WEB';
}

function recortar(valor: string | null, max: number): string | null {
    if (!valor) return null;
    const texto = valor.trim();
    if (!texto) return null;
    return texto.slice(0, max);
}
