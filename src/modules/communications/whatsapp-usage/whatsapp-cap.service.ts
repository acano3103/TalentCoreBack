import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { FilaPrecioWa, PrecioWa, precioVigente } from '../delivery/precio-wa';
import { aNumero, debeAvisar80, evaluarTope, EstadoTope, mesActual, redondear } from './periodo';

interface FilaTope {
    id: number;
    idEmpresa: number | null;
    TopeMensual: unknown;
    Accion: string;
    Aviso80Mes: string | null;
}

@Injectable()
export class WhatsAppCapService {
    private readonly logger = new Logger(WhatsAppCapService.name);

    constructor(
        private readonly prisma: PrismaService,
        @Optional() private readonly dispatcher?: NotificationDispatcher,
        @Optional() private readonly config?: ConfigService,
    ) {}

    /** CRÍTICA siempre puede salir. El tope con BLOQUEAR frena el resto al 100 %. */
    async canSend(idTenant: number, idEmpresa: number, prioridad: string, ahora = new Date()): Promise<boolean> {
        const foto = await this.foto(idTenant, idEmpresa, ahora);
        return !evaluarTope({
            consumo: foto.consumo,
            tope: foto.tope,
            accion: foto.accion,
            prioridad,
        })?.bloqueaEnvio;
    }

    async estado(idTenant: number, idEmpresa: number, prioridad = 'NORMAL', ahora = new Date()): Promise<EstadoTope | null> {
        const foto = await this.foto(idTenant, idEmpresa, ahora);
        return evaluarTope({ consumo: foto.consumo, tope: foto.tope, accion: foto.accion, prioridad });
    }

    async precioActual(idTenant: number, ahora: Date, categoria: string): Promise<PrecioWa | null> {
        return precioVigente(await this.filasPrecio(idTenant, ahora), idTenant, ahora, categoria);
    }

    async paraRevision(idTenant: number, idEmpresa: number, prioridad: string, destinatarios: number, ahora = new Date()) {
        const [precio, tope] = await Promise.all([
            this.precioActual(idTenant, ahora, prioridad),
            this.estado(idTenant, idEmpresa, prioridad, ahora),
        ]);
        return {
            costoEstimado: precio ? redondear(precio.precio * Math.max(0, destinatarios), 4) : null,
            moneda: precio?.moneda ?? null,
            tope,
        };
    }

    /**
     * Una vez por mes y por tope. El compare-and-set evita el segundo aviso
     * si dos envíos cruzan el 80 % al mismo tiempo.
     */
    async revisarAviso(idTenant: number, idEmpresa: number, ahora = new Date()): Promise<boolean> {
        try {
            return await this.intentarAviso(idTenant, idEmpresa, ahora);
        } catch (error) {
            const mensaje = error instanceof Error ? error.message : 'No se pudo avisar del tope.';
            this.logger.warn(`Aviso de WhatsApp al 80 % no salió para el tenant ${idTenant}: ${mensaje}`);
            return false;
        }
    }

    private async intentarAviso(idTenant: number, idEmpresa: number, ahora: Date): Promise<boolean> {
        const mes = mesActual(ahora);
        const foto = await this.foto(idTenant, idEmpresa, ahora);
        if (!foto.fila || !debeAvisar80(foto.consumo, foto.tope, foto.fila.Aviso80Mes, mes)) return false;
        const marcado = await this.prisma.waTopes.updateMany({
            where: {
                id: foto.fila.id,
                OR: [{ Aviso80Mes: null }, { Aviso80Mes: { not: mes } }],
            },
            data: { Aviso80Mes: mes },
        });
        if (marcado.count !== 1) return false;
        if (this.dispatcher) await this.avisar(idTenant, idEmpresa, foto, mes);
        return true;
    }

    private async avisar(
        idTenant: number,
        idEmpresa: number,
        foto: { consumo: number; tope: number | null; accion: string | null },
        mes: string,
    ): Promise<void> {
        const [personas, empresa] = await Promise.all([
            this.prisma.$queryRaw<{ uuid: string; email: string; nombre: string }[]>(Prisma.sql`
                SELECT DISTINCT u.uuid AS uuid, u.email AS email, u.first_name AS nombre
                FROM RelRolComCapacidad rc
                INNER JOIN CatComCapacidades c ON c.idCapacidad = rc.idCapacidad
                INNER JOIN RelUsuarioRol ur ON ur.idRol = rc.idRol AND ur.activo = 1
                INNER JOIN auth_user u ON u.id = ur.idUsuario
                WHERE rc.idTenant = ${idTenant}
                  AND c.Codigo = 'CFG_CANALES'
                  AND u.idTenant = ${idTenant}
                  AND u.is_active = 1
            `),
            this.prisma.catEmpresas.findFirst({
                where: { idEmpresa, idTenant },
                select: { nombre_comercial: true },
            }),
        ]);
        const tope = redondear(foto.tope ?? 0, 2);
        const consumido = redondear(foto.consumo, 2);
        const nombreEmpresa = empresa?.nombre_comercial?.trim() || 'tu organización';
        const titulo = 'El consumo de WhatsApp llegó al 80 %';
        const mensaje = `En ${nombreEmpresa} van ${consumido} de ${tope} este mes. Revisa el tope antes de que se detengan los envíos.`;
        const base = (this.config?.get<string>('FRONT_URL') || this.config?.get<string>('APP_URL') || '').replace(/\/+$/, '');
        const enlace = base ? `${base}/comunicacion/whatsapp` : '/comunicacion/whatsapp';
        for (const persona of personas) {
            if (!persona.uuid) continue;
            try {
                await this.dispatcher?.dispatchComms(
                    { userUuid: persona.uuid },
                    {
                        userUuid: persona.uuid,
                        titulo,
                        mensaje,
                        categoria: 'SISTEMA',
                        prioridad: 'IMPORTANTE',
                        deepLink: '/comunicacion/whatsapp',
                        origenTipo: 'TOPE_WHATSAPP',
                        origenId: `${idTenant}:${idEmpresa}:${mes}`.slice(0, 40),
                        idTenant,
                        idEmpresa,
                        notificationTypeCode: 'SISTEMA',
                        correo: persona.email
                            ? {
                                  to: persona.email,
                                  context: { nombre: persona.nombre || 'hola', titulo, resumen: mensaje, enlace },
                              }
                            : undefined,
                    },
                    [
                        { codigo: 'SOCKETS', enviarAhora: true },
                        { codigo: 'EMAIL', enviarAhora: Boolean(persona.email) },
                    ],
                );
            } catch (error) {
                const detalle = error instanceof Error ? error.message : 'falló el aviso';
                this.logger.warn(`No se avisó a ${persona.uuid}: ${detalle}`);
            }
        }
    }

    private async foto(idTenant: number, idEmpresa: number, ahora: Date): Promise<{
        fila: FilaTope | null;
        consumo: number;
        tope: number | null;
        accion: string | null;
    }> {
        const inicio = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
        const [suma, topes] = await Promise.all([
            this.prisma.waConsumo.aggregate({
                where: { idTenant, idEmpresa, EnviadoEn: { gte: inicio }, Estatus: { not: 'FALLIDO' } },
                _sum: { Costo: true },
            }),
            this.prisma.waTopes.findMany({
                where: { idTenant, Activo: true, OR: [{ idEmpresa }, { idEmpresa: null }] },
                orderBy: { id: 'desc' },
            }),
        ]);
        const fila = elegirTope(topes, idEmpresa);
        return {
            fila,
            consumo: aNumero(suma._sum.Costo),
            tope: fila ? aNumero(fila.TopeMensual) : null,
            accion: fila?.Accion ?? null,
        };
    }

    private async filasPrecio(idTenant: number, ahora: Date): Promise<FilaPrecioWa[]> {
        const filas = await this.prisma.waPrecios.findMany({
            where: { VigenteDesde: { lte: ahora }, OR: [{ idTenant }, { idTenant: null }] },
            orderBy: [{ VigenteDesde: 'asc' }, { id: 'asc' }],
        });
        return filas.map((fila) => ({
            id: fila.id,
            idTenant: fila.idTenant,
            precioBase: aNumero(fila.PrecioBase),
            preciosCategoria: fila.PreciosCategoria,
            moneda: fila.Moneda,
            vigenteDesde: fila.VigenteDesde,
        }));
    }
}

function elegirTope(topes: FilaTope[], idEmpresa: number): FilaTope | null {
    const deEmpresa = topes.filter((tope) => tope.idEmpresa === idEmpresa);
    const pool = deEmpresa.length ? deEmpresa : topes.filter((tope) => tope.idEmpresa == null);
    return pool[0] ?? null;
}
