import { Injectable, Logger } from '@nestjs/common';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { rangoDiaLocal } from 'src/modules/communications/me/bandeja';
import { whereNoLeidas } from 'src/modules/notifications/campana';
import { PrismaService } from 'src/prisma/prisma.service';

const ZONA_DEFAULT = 'America/Mexico_City';
const AVISOS_HOY = 3;

@Injectable()
export class MobileDashboardService {
    private readonly logger = new Logger(MobileDashboardService.name);

    constructor(private readonly prisma: PrismaService) { }

    async getSummary(activeUser: ActiveUserDto, companyId: number) {
        const { id: userId, email, username } = activeUser;

        this.logger.log(`Consultando dashboard para el usuario ID: ${userId} (${email || username})`);

        // 2. Consulta de ejemplo a la base de datos con Prisma
        // (Ajusta la tabla según tu esquema, por ejemplo consultar datos básicos del usuario o asistencias)
        const userDb = await this.prisma.auth_user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
                is_active: true,
            },
        });

        const comunicacion = await this.comunicacion(activeUser, companyId);

        return {
            message: 'Dashboard data retrieved successfully',
            user: {
                id: userId,
                fullName: `${userDb?.first_name ?? ''} ${userDb?.last_name ?? ''}`.trim(),
                email: userDb?.email ?? email,
            },
            dashboard: {
                // Aquí agregarán la lógica real de asistencias
                todayAttendance: {
                    hasCheckedIn: false,
                    checkInTime: null,
                    checkOutTime: null,
                },
                notificationsCount: comunicacion.notificacionesSinLeer,
            },
            comunicacion,
        };
    }

    private async comunicacion(activeUser: ActiveUserDto, companyId: number) {
        const ahora = new Date();
        const sinLeer = await this.prisma.notificaciones.count({
            where: whereNoLeidas({
                userUuid: activeUser.uuid,
                companyId,
                idTenant: activeUser.idTenant,
                ahora,
            }),
        });
        const empleado = await this.prisma.empleados.findFirst({
            where: { idUsuario: activeUser.uuid, idEmpresa: companyId, idTenant: activeUser.idTenant, activo: true },
            select: { idEmpleado: true, idSite: true },
        });
        if (!empleado) {
            return { porConfirmar: 0, primeroPorConfirmar: null, avisosHoy: [], notificacionesSinLeer: sinLeer };
        }
        const zona = empleado.idSite
            ? (await this.prisma.catSites.findUnique({ where: { idSite: empleado.idSite }, select: { zonaHoraria: true } }))?.zonaHoraria
            : null;
        const dia = rangoDiaLocal(ahora, zona || ZONA_DEFAULT);
        const [pendientes, deHoy] = await Promise.all([
            this.prisma.comDestinatarios.findMany({
                where: {
                    idEmpleado: empleado.idEmpleado,
                    Estado: { notIn: ['CONFIRMADO', 'EXPIRADO'] },
                    ComComunicados: {
                        idEmpresa: companyId,
                        idTenant: activeUser.idTenant,
                        Estado: 'ENVIADO',
                        AcuseModo: { in: ['LEIDO', 'LEI_ENTENDI'] },
                        OR: [{ VigenteHasta: null }, { VigenteHasta: { gt: ahora } }],
                    },
                },
                include: { ComComunicados: { select: { idComunicado: true, EnviadoEn: true, VersionActual: true } } },
            }),
            this.prisma.comDestinatarios.findMany({
                where: {
                    idEmpleado: empleado.idEmpleado,
                    ComComunicados: {
                        idEmpresa: companyId,
                        idTenant: activeUser.idTenant,
                        Estado: { in: ['ENVIADO', 'EXPIRADO'] },
                        EnviadoEn: { gte: dia.inicio, lt: dia.fin },
                    },
                },
                include: {
                    ComComunicados: {
                        select: {
                            idComunicado: true,
                            EnviadoEn: true,
                            Prioridad: true,
                            VersionActual: true,
                            CreadoPor: true,
                            ComTiposComunicado: { select: { Codigo: true } },
                        },
                    },
                },
            }),
        ]);
        const ordenados = [...pendientes].sort(
            (a, b) => (b.ComComunicados.EnviadoEn?.getTime() ?? 0) - (a.ComComunicados.EnviadoEn?.getTime() ?? 0),
        );
        const primero = ordenados[0];
        const tituloPrimero = primero ? await this.tituloDe(primero.ComComunicados.idComunicado, primero.ComComunicados.VersionActual) : null;
        const hoy = [...deHoy]
            .sort((a, b) => (b.ComComunicados.EnviadoEn?.getTime() ?? 0) - (a.ComComunicados.EnviadoEn?.getTime() ?? 0))
            .slice(0, AVISOS_HOY);
        const titulos = await this.titulosDe(hoy.map((fila) => ({ id: fila.ComComunicados.idComunicado, num: fila.ComComunicados.VersionActual })));
        const emisores = await this.nombresDe(hoy.map((fila) => fila.ComComunicados.CreadoPor));
        return {
            porConfirmar: pendientes.length,
            primeroPorConfirmar: primero && tituloPrimero
                ? { id: primero.ComComunicados.idComunicado, titulo: tituloPrimero }
                : null,
            avisosHoy: hoy.map((fila) => ({
                id: fila.ComComunicados.idComunicado,
                titulo: titulos.get(`${fila.ComComunicados.idComunicado}:${fila.ComComunicados.VersionActual}`) ?? '',
                tipo: fila.ComComunicados.ComTiposComunicado.Codigo,
                prioridad: fila.ComComunicados.Prioridad,
                emisor: emisores.get(fila.ComComunicados.CreadoPor) ?? '',
                enviadoEn: fila.ComComunicados.EnviadoEn,
            })),
            notificacionesSinLeer: sinLeer,
        };
    }

    private async tituloDe(idComunicado: number, numVersion: number): Promise<string | null> {
        const fila = await this.prisma.comComunicadoVersiones.findUnique({
            where: { idComunicado_NumVersion: { idComunicado, NumVersion: numVersion } },
            select: { Titulo: true },
        });
        return fila?.Titulo ?? null;
    }

    private async titulosDe(pares: { id: number; num: number }[]): Promise<Map<string, string>> {
        const mapa = new Map<string, string>();
        if (!pares.length) return mapa;
        const filas = await this.prisma.comComunicadoVersiones.findMany({
            where: { OR: pares.map((par) => ({ idComunicado: par.id, NumVersion: par.num })) },
            select: { idComunicado: true, NumVersion: true, Titulo: true },
        });
        for (const fila of filas) mapa.set(`${fila.idComunicado}:${fila.NumVersion}`, fila.Titulo);
        return mapa;
    }

    private async nombresDe(uuids: string[]): Promise<Map<string, string>> {
        const unicos = [...new Set(uuids.filter(Boolean))];
        if (!unicos.length) return new Map();
        const filas = await this.prisma.auth_user.findMany({
            where: { uuid: { in: unicos } },
            select: { uuid: true, first_name: true, last_name: true, username: true },
        });
        return new Map(filas.map((fila) => [fila.uuid, `${fila.first_name} ${fila.last_name}`.trim() || fila.username]));
    }
}
