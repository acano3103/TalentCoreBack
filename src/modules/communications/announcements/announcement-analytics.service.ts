import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ExcelExportService } from 'src/common/services/excel-export.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { ContextoAlcance } from '../capabilities/alcance';
import { CommsCapabilityService } from '../capabilities/comms-capability.service';
import { AudienceResolverService } from '../audiences/audience-resolver.service';
import { errorComms } from '../comms-http';
import { normalizarCanales } from '../channels/canales';
import { AnnouncementDispatchService } from '../delivery/announcement-dispatch.service';
import {
    COLUMNAS_DESGLOSE,
    COLUMNAS_EVIDENCIA,
    CORTES,
    CorteDesglose,
    HORAS_VENTANA,
    SEGUNDOS_POR_CORTE,
    acumularCortes,
    conteosCanal,
    conteosCorte,
    conteosEstado,
    conteosGrupo,
    curvaDe,
    desgloseDe,
    filasEvidencia,
    filtroReenvio,
    kpisDe,
    nombrePersona,
    porCanalDesdeConteos,
} from './analitica';
import { DesgloseQuery, DestinatariosQuery, ReenviarDto, ResponderPreguntaDto } from './dto/analitica.dto';

const TRANSACCION = { maxWait: 15_000, timeout: 20_000 };
const PAGINA = 20;
const ESTADOS_REENVIABLES = new Set(['ENVIADO', 'ENVIANDO']);

@Injectable()
export class AnnouncementAnalyticsService {
    private readonly logger = new Logger(AnnouncementAnalyticsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly capabilities: CommsCapabilityService,
        private readonly resolver: AudienceResolverService,
        private readonly envio: AnnouncementDispatchService,
        private readonly excel: ExcelExportService,
        private readonly dispatcher: NotificationDispatcher,
    ) {}

    async analitica(activeUser: ActiveUserDto, companyId: number, id: number) {
        const comunicado = await this.exigirVisible(activeUser, companyId, id);
        const [estados, lecturas, acuses, canales] = await Promise.all([
            this.prisma.$queryRaw<object[]>(Prisma.sql`
                SELECT Estado AS estado, COUNT(*) AS total
                FROM ComDestinatarios
                WHERE idComunicado = ${id}
                GROUP BY Estado
            `),
            this.curva(id, comunicado.EnviadoEn, 'LeidoEn'),
            this.curvaAcuses(id, comunicado.EnviadoEn),
            this.prisma.$queryRaw<object[]>(Prisma.sql`
                SELECT jt.canal AS canal,
                       COUNT(*) AS destinatarios,
                       SUM(d.Estado IN ('ENTREGADO', 'LEIDO', 'CONFIRMADO')) AS entregados,
                       SUM(d.Estado IN ('LEIDO', 'CONFIRMADO')) AS leidos
                FROM ComDestinatarios d
                JOIN JSON_TABLE(d.CanalesEfectivos, '$[*]' COLUMNS (canal VARCHAR(20) PATH '$')) jt
                WHERE d.idComunicado = ${id}
                GROUP BY jt.canal
            `),
        ]);
        return {
            ...kpisDe(conteosEstado(estados)),
            curva: curvaDe(lecturas, acuses),
            porCanal: porCanalDesdeConteos(conteosCanal(canales)),
        };
    }

    async desglose(activeUser: ActiveUserDto, companyId: number, id: number, query: DesgloseQuery) {
        await this.exigirVisible(activeUser, companyId, id);
        const columna = COLUMNAS_DESGLOSE[query.by];
        if (!columna) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'El desglose debe ser ubicación, área, puesto, tipo de personal o jefe.');
        }
        const filas = await this.prisma.$queryRaw<object[]>(Prisma.sql`
            SELECT ${Prisma.raw(columna)} AS id, Estado AS estado, COUNT(*) AS total
            FROM ComDestinatarios
            WHERE idComunicado = ${id}
            GROUP BY ${Prisma.raw(columna)}, Estado
        `);
        const grupos = conteosGrupo(filas);
        const nombres = await this.nombres(query.by, grupos.map((fila) => fila.id).filter((valor): valor is number => valor != null));
        return { by: query.by, grupos: desgloseDe(grupos, nombres, query.by) };
    }

    async destinatarios(activeUser: ActiveUserDto, companyId: number, id: number, query: DestinatariosQuery) {
        await this.exigirVisible(activeUser, companyId, id);
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? PAGINA;
        const where = this.filtroDestinatarios(id, query);
        const [total, filas] = await Promise.all([
            this.prisma.comDestinatarios.count({ where }),
            this.prisma.comDestinatarios.findMany({
                where,
                orderBy: { idDestinatario: 'asc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
                select: {
                    idDestinatario: true,
                    idEmpleado: true,
                    idSite: true,
                    Estado: true,
                    CanalesEfectivos: true,
                    UltimoIntentoEn: true,
                    Empleados: { select: { nombre: true, primerApellido: true, segundoApellido: true } },
                },
            }),
        ]);
        const sitios = await this.nombres('site', idsDe(filas.map((fila) => fila.idSite)));
        return {
            total,
            page,
            pageSize,
            items: filas.map((fila) => ({
                idDestinatario: fila.idDestinatario,
                idEmpleado: fila.idEmpleado,
                colaborador: nombrePersona(fila.Empleados),
                idSite: fila.idSite,
                ubicacion: fila.idSite == null ? 'Sin ubicación' : (sitios.get(fila.idSite) ?? 'Sin ubicación'),
                canales: normalizarCanales(fila.CanalesEfectivos),
                ultimoIntento: fila.UltimoIntentoEn,
                estado: fila.Estado,
            })),
        };
    }

    async exportar(activeUser: ActiveUserDto, companyId: number, id: number): Promise<Buffer> {
        await this.exigirVisible(activeUser, companyId, id);
        const filas = await this.prisma.comDestinatarios.findMany({
            where: { idComunicado: id },
            orderBy: { idDestinatario: 'asc' },
            select: {
                idSite: true,
                Estado: true,
                Empleados: { select: { nombre: true, primerApellido: true, segundoApellido: true } },
                ComAcuses: {
                    orderBy: { FechaUtc: 'asc' },
                    select: {
                        FechaUtc: true,
                        ZonaHoraria: true,
                        Canal: true,
                        Metodo: true,
                        Ip: true,
                        Dispositivo: true,
                        ComComunicadoVersiones: { select: { NumVersion: true } },
                    },
                },
            },
        });
        const sitios = await this.nombres('site', idsDe(filas.map((fila) => fila.idSite)));
        const rows = filasEvidencia(
            filas.map((fila) => ({
                colaborador: nombrePersona(fila.Empleados),
                ubicacion: fila.idSite == null ? 'Sin ubicación' : (sitios.get(fila.idSite) ?? 'Sin ubicación'),
                estado: fila.Estado,
                acuses: fila.ComAcuses.map((acuse) => ({
                    fechaUtc: acuse.FechaUtc,
                    zonaHoraria: acuse.ZonaHoraria,
                    canal: acuse.Canal,
                    metodo: acuse.Metodo,
                    ip: acuse.Ip,
                    dispositivo: acuse.Dispositivo,
                    version: acuse.ComComunicadoVersiones?.NumVersion ?? null,
                })),
            })),
        );
        return this.excel.generate({
            sheetName: 'Acuses',
            columns: COLUMNAS_EVIDENCIA.map((columna) => ({ ...columna })),
            rows,
        });
    }

    async reenviar(activeUser: ActiveUserDto, companyId: number, id: number, dto: ReenviarDto) {
        const comunicado = await this.exigirVisible(activeUser, companyId, id);
        if (!ESTADOS_REENVIABLES.has(comunicado.Estado)) {
            throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'Solo puedes reenviar un comunicado que ya se envió.');
        }
        if (dto.alcance === 'SITE' && !dto.idSite) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'Indica la ubicación para reenviar.');
        }
        const where = filtroReenvio(id, dto.alcance, dto.idSite);
        const pendientes = await this.prisma.comDestinatarios.findMany({
            where,
            select: { idDestinatario: true },
            orderBy: { idDestinatario: 'asc' },
        });
        const resultado = await this.envio.reencolarPendientes(
            id,
            pendientes.map((fila) => fila.idDestinatario),
        );
        await this.prisma.historicoMovimientos.create({
            data: bitacora(activeUser, companyId, id, `reenvió el comunicado a ${resultado.reenviados} personas pendientes.`),
        });
        return { ...resultado, alcance: dto.alcance, idSite: dto.alcance === 'SITE' ? dto.idSite : null };
    }

    async preguntas(activeUser: ActiveUserDto, companyId: number, id: number) {
        await this.exigirVisible(activeUser, companyId, id);
        const filas = await this.prisma.comPreguntas.findMany({
            where: { idComunicado: id },
            orderBy: [{ FechaRespuesta: 'asc' }, { FechaPregunta: 'desc' }],
            include: { Empleados: { select: { nombre: true, primerApellido: true, segundoApellido: true } } },
        });
        return filas.map((fila) => ({
            id: fila.idPregunta,
            idEmpleado: fila.idEmpleado,
            colaborador: nombrePersona(fila.Empleados),
            pregunta: fila.Pregunta,
            respuesta: fila.Respuesta,
            fechaPregunta: fila.FechaPregunta,
            fechaRespuesta: fila.FechaRespuesta,
            respondida: fila.Respuesta != null,
        }));
    }

    async responder(activeUser: ActiveUserDto, companyId: number, id: number, qid: number, dto: ResponderPreguntaDto) {
        const comunicado = await this.exigirVisible(activeUser, companyId, id);
        const respuesta = dto.respuesta.trim();
        if (!respuesta || respuesta.length > 2000) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'La respuesta debe tener entre 1 y 2000 caracteres.');
        }
        const ahora = new Date();
        const guardada = await this.prisma.$transaction(async (tx) => {
            const pregunta = await tx.comPreguntas.findFirst({
                where: { idPregunta: qid, idComunicado: id },
            });
            if (!pregunta) throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos esa pregunta.');
            if (pregunta.Respuesta != null) {
                throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'Esta pregunta ya tiene respuesta.');
            }
            await tx.comPreguntas.update({
                where: { idPregunta: qid },
                data: { Respuesta: respuesta, RespondidoPor: activeUser.uuid, FechaRespuesta: ahora },
            });
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, id, 'respondió una pregunta del comunicado.'),
            });
            return pregunta;
        }, TRANSACCION);
        const notificado = await this.avisarRespuesta(comunicado, guardada.idEmpleado, companyId, id, qid, respuesta);
        return { id: qid, respuesta, fechaRespuesta: ahora, notificado };
    }

    private async curva(idComunicado: number, enviadoEn: Date | null, columna: 'LeidoEn' | 'ConfirmadoEn'): Promise<number[]> {
        if (!enviadoEn) return acumularCortes([]);
        const fin = new Date(enviadoEn.getTime() + HORAS_VENTANA * 3600_000);
        const filas = await this.prisma.$queryRaw<object[]>(Prisma.sql`
            SELECT LEAST(FLOOR(TIMESTAMPDIFF(SECOND, ${enviadoEn}, ${Prisma.raw(columna)}) / ${SEGUNDOS_POR_CORTE}), ${CORTES - 1}) AS corte,
                   COUNT(*) AS total
            FROM ComDestinatarios
            WHERE idComunicado = ${idComunicado}
              AND ${Prisma.raw(columna)} IS NOT NULL
              AND ${Prisma.raw(columna)} >= ${enviadoEn}
              AND ${Prisma.raw(columna)} <= ${fin}
            GROUP BY corte
        `);
        return acumularCortes(conteosCorte(filas));
    }

    private async curvaAcuses(idComunicado: number, enviadoEn: Date | null): Promise<number[]> {
        if (!enviadoEn) return acumularCortes([]);
        const fin = new Date(enviadoEn.getTime() + HORAS_VENTANA * 3600_000);
        const filas = await this.prisma.$queryRaw<object[]>(Prisma.sql`
            SELECT LEAST(FLOOR(TIMESTAMPDIFF(SECOND, ${enviadoEn}, acuse.primera) / ${SEGUNDOS_POR_CORTE}), ${CORTES - 1}) AS corte,
                   COUNT(*) AS total
            FROM (
                SELECT MIN(FechaUtc) AS primera
                FROM ComAcuses
                WHERE idComunicado = ${idComunicado}
                GROUP BY idDestinatario
            ) acuse
            WHERE acuse.primera >= ${enviadoEn}
              AND acuse.primera <= ${fin}
            GROUP BY corte
        `);
        return acumularCortes(conteosCorte(filas));
    }

    private filtroDestinatarios(id: number, query: DestinatariosQuery): Prisma.ComDestinatariosWhereInput {
        const termino = query.search?.trim();
        return {
            idComunicado: id,
            ...(query.estado ? { Estado: query.estado } : {}),
            ...(query.site ? { idSite: query.site } : {}),
            ...(termino
                ? {
                      Empleados: {
                          OR: [
                              { nombre: { contains: termino } },
                              { primerApellido: { contains: termino } },
                              { segundoApellido: { contains: termino } },
                              { numeroEmpleado: { contains: termino } },
                          ],
                      },
                  }
                : {}),
        };
    }

    private async nombres(corte: CorteDesglose, ids: number[]): Promise<Map<number, string>> {
        const unicos = [...new Set(ids)];
        if (!unicos.length) return new Map();
        const mapa = new Map<number, string>();
        if (corte === 'site') {
            const filas = await this.prisma.catSites.findMany({
                where: { idSite: { in: unicos } },
                select: { idSite: true, Descripcion: true },
            });
            for (const fila of filas) mapa.set(fila.idSite, fila.Descripcion?.trim() || `Ubicación ${fila.idSite}`);
        } else if (corte === 'area') {
            const filas = await this.prisma.catAreas.findMany({
                where: { idArea: { in: unicos } },
                select: { idArea: true, Descripcion: true },
            });
            for (const fila of filas) mapa.set(fila.idArea, fila.Descripcion.trim() || `Área ${fila.idArea}`);
        } else if (corte === 'position') {
            const filas = await this.prisma.catPuestos.findMany({
                where: { idPuesto: { in: unicos } },
                select: { idPuesto: true, NombrePuesto: true },
            });
            for (const fila of filas) mapa.set(fila.idPuesto, fila.NombrePuesto.trim() || `Puesto ${fila.idPuesto}`);
        } else if (corte === 'staffType') {
            const filas = await this.prisma.catTiposPersonal.findMany({
                where: { idTipoPersonal: { in: unicos } },
                select: { idTipoPersonal: true, Nombre: true },
            });
            for (const fila of filas) mapa.set(fila.idTipoPersonal, fila.Nombre.trim() || `Tipo ${fila.idTipoPersonal}`);
        } else {
            const filas = await this.prisma.empleados.findMany({
                where: { idEmpleado: { in: unicos } },
                select: { idEmpleado: true, nombre: true, primerApellido: true, segundoApellido: true },
            });
            for (const fila of filas) mapa.set(fila.idEmpleado, nombrePersona(fila));
        }
        const prefijo = { site: 'Ubicación', area: 'Área', position: 'Puesto', staffType: 'Tipo', manager: 'Jefe' } as const;
        for (const id of unicos) if (!mapa.has(id)) mapa.set(id, `${prefijo[corte]} ${id}`);
        return mapa;
    }

    private async avisarRespuesta(
        comunicado: { idTenant: number; idEmpresa: number },
        idEmpleado: number,
        companyId: number,
        idComunicado: number,
        idPregunta: number,
        respuesta: string,
    ): Promise<boolean> {
        const dest = await this.prisma.comDestinatarios.findUnique({
            where: { idComunicado_idEmpleado: { idComunicado, idEmpleado } },
            select: { idUsuario: true },
        });
        if (!dest?.idUsuario) return false;
        try {
            await this.dispatcher.dispatchComms(
                { userUuid: dest.idUsuario },
                {
                    userUuid: dest.idUsuario,
                    titulo: 'Respondimos tu pregunta',
                    mensaje: respuesta.slice(0, 180),
                    categoria: 'COMUNICADO',
                    prioridad: 'NORMAL',
                    deepLink: `/companies/${companyId}/comms/announcements/${idComunicado}`,
                    destino: { tipo: 'MI_COMUNICADO', id: idComunicado },
                    origenTipo: 'COMUNICADO_PREGUNTA',
                    origenId: String(idPregunta),
                    idTenant: comunicado.idTenant,
                    idEmpresa: comunicado.idEmpresa,
                    notificationTypeCode: 'COMUNICADO',
                    push: {
                        title: 'Respondimos tu pregunta',
                        body: respuesta.slice(0, 180),
                        data: { idComunicado: String(idComunicado) },
                    },
                },
                [
                    { codigo: 'SOCKETS', enviarAhora: true },
                    { codigo: 'PUSH', enviarAhora: true },
                ],
            );
            return true;
        } catch (error) {
            this.logger.warn(`No se avisó la respuesta ${idPregunta}: ${error instanceof Error ? error.message : 'Error desconocido.'}`);
            return false;
        }
    }

    private async exigirVisible(activeUser: ActiveUserDto, companyId: number, id: number) {
        const fila = await this.prisma.comComunicados.findFirst({
            where: { idComunicado: id, idEmpresa: companyId, idTenant: activeUser.idTenant },
        });
        if (!fila) throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos ese comunicado.');
        if (fila.CreadoPor === activeUser.uuid) return fila;
        let scope: ContextoAlcance;
        try {
            scope = await this.capabilities.contexto('COM_VER_ANALITICA', activeUser, companyId);
        } catch (error) {
            if (esSinCapacidad(error)) {
                throw errorComms(HttpStatus.FORBIDDEN, 'SIN_CAPACIDAD', 'No tienes permiso para ver la analítica de este comunicado.');
            }
            throw error;
        }
        if (veTodaLaEmpresa(scope, companyId)) return fila;
        const resultado = await this.resolver.resolve({}, scope);
        const autores = new Set(await this.uuidsDe(resultado.ids));
        if (!autores.has(fila.CreadoPor)) {
            throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos ese comunicado.');
        }
        return fila;
    }

    private async uuidsDe(ids: number[]): Promise<string[]> {
        if (!ids.length) return [];
        const uuids: string[] = [];
        for (let inicio = 0; inicio < ids.length; inicio += 2000) {
            const filas = await this.prisma.empleados.findMany({
                where: { idEmpleado: { in: ids.slice(inicio, inicio + 2000) }, idUsuario: { not: null } },
                select: { idUsuario: true },
            });
            for (const fila of filas) if (fila.idUsuario) uuids.push(fila.idUsuario);
        }
        return uuids;
    }
}

function idsDe(ids: (number | null)[]): number[] {
    return ids.filter((id): id is number => id != null);
}

function veTodaLaEmpresa(scope: ContextoAlcance, companyId: number): boolean {
    if (scope.alcance === 'TENANT') return true;
    return scope.alcance === 'EMPRESAS' && (scope.referencias ?? []).includes(companyId);
}

function esSinCapacidad(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('getResponse' in error)) return false;
    const body = (error as { getResponse: () => unknown }).getResponse();
    return typeof body === 'object' && body !== null && (body as { code?: string }).code === 'SIN_CAPACIDAD';
}

function bitacora(activeUser: ActiveUserDto, companyId: number, id: number, verbo: string) {
    return {
        idUsuario: activeUser.id,
        idEmpresa: companyId,
        accion: 'ACTUALIZAR',
        tablaOrigen: 'ComComunicados',
        idRegistro: String(id),
        descripcion: `${activeUser.first_name} ${activeUser.last_name} ${verbo}`,
        fechaCreacion: new Date(),
    };
}
