import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { presentarAdjunto, presentarPortada } from '../announcements/archivo-publico';
import { aTextoPlano } from '../announcements/sanitize-cuerpo';
import { CommsStorageService } from '../announcements/comms-storage.service';
import { errorComms } from '../comms-http';
import { diaLocal, esVigente, filtroComunicado, filtroEstadoDestinatario, filtroTipo, PAGINA_BANDEJA, TabBandeja } from './bandeja';
import { ContextoCliente } from './cliente-http';
import { CommsAckService } from './comms-ack.service';
import { BandejaCommsQuery } from './dto/me-comms.dto';
import { SnoozeStore, TTL_SNOOZE_SEGUNDOS } from './snooze.store';

const ORIGEN = 'COMUNICADO';
const TTL_ARCHIVO = 60 * 60;
const ZONA_DEFAULT = 'America/Mexico_City';
const MAX_MODAL = 10;
const MAX_PREGUNTAS = 3;

@Injectable()
export class MeCommsService {
    private readonly logger = new Logger(MeCommsService.name);
    ahora: () => Date = () => new Date();

    constructor(
        private readonly prisma: PrismaService,
        private readonly ack: CommsAckService,
        private readonly storage: CommsStorageService,
        private readonly snooze: SnoozeStore,
    ) {}

    async listar(activeUser: ActiveUserDto, companyId: number, query: BandejaCommsQuery) {
        const empleado = await this.empleadoDe(activeUser, companyId);
        const tab: TabBandeja = query.tab ?? 'pendientes';
        const ahora = this.ahora();
        const tipo = filtroTipo(query.tipo);
        const estadoDest = filtroEstadoDestinatario(tab);
        const filas = await this.prisma.comDestinatarios.findMany({
            where: {
                idEmpleado: empleado.idEmpleado,
                ...(estadoDest ? { Estado: estadoDest } : {}),
                ComComunicados: {
                    idEmpresa: companyId,
                    idTenant: activeUser.idTenant,
                    ...filtroComunicado(tab, ahora),
                    ...(tipo.idTipo ? { idTipo: tipo.idTipo } : {}),
                    ...(tipo.codigo ? { ComTiposComunicado: { Codigo: tipo.codigo } } : {}),
                },
            },
            include: { ComComunicados: { include: { ComTiposComunicado: true } } },
        });
        const versiones = await this.versionesDe(filas.map((fila) => ({ id: fila.idComunicado, num: fila.ComComunicados.VersionActual })));
        const busqueda = query.search?.trim().toLowerCase() ?? '';
        const coinciden = filas
            .map((fila) => {
                const version = versiones.get(claveVersion(fila.idComunicado, fila.ComComunicados.VersionActual));
                if (!version) return null;
                if (busqueda && !`${version.Titulo} ${version.Resumen}`.toLowerCase().includes(busqueda)) return null;
                return tarjeta(fila, version);
            })
            .filter((fila): fila is ReturnType<typeof tarjeta> => fila !== null)
            .sort((a, b) => (b.enviadoEn?.getTime() ?? 0) - (a.enviadoEn?.getTime() ?? 0));
        const page = query.page ?? 1;
        const inicio = (page - 1) * PAGINA_BANDEJA;
        return { total: coinciden.length, page, pageSize: PAGINA_BANDEJA, items: coinciden.slice(inicio, inicio + PAGINA_BANDEJA) };
    }

    async detalle(activeUser: ActiveUserDto, companyId: number, id: number, contexto: ContextoCliente) {
        const empleado = await this.empleadoDe(activeUser, companyId);
        const dest = await this.destinatario(empleado.idEmpleado, companyId, activeUser.idTenant, id);
        const comunicado = dest.ComComunicados;
        const version = await this.versionVigente(comunicado.idComunicado, comunicado.VersionActual);
        const ahora = this.ahora();
        const leidoEn = await this.marcarLeido(dest, ahora);
        let confirmadoEn = dest.ConfirmadoEn;
        let miEstado = dest.Estado === 'CONFIRMADO' || dest.Estado === 'EXPIRADO' ? dest.Estado : 'LEIDO';
        let versionConfirmada = dest.VersionConfirmada;
        if (comunicado.AcuseModo === 'LEIDO' && esVigente(comunicado.Estado, comunicado.VigenteHasta, ahora) && dest.Estado !== 'CONFIRMADO') {
            const acuse = await this.ack.confirmar({
                companyId,
                idTenant: activeUser.idTenant,
                idComunicado: id,
                idEmpleado: empleado.idEmpleado,
                canal: contexto.canal,
                metodo: 'LECTURA',
                ip: contexto.ip,
                userAgent: contexto.userAgent,
                dispositivo: contexto.dispositivo,
                zonaHoraria: await this.zonaDe(empleado.idSite),
            });
            confirmadoEn = acuse.confirmadoEn;
            miEstado = 'CONFIRMADO';
            versionConfirmada = acuse.version;
        }
        await this.marcarEntregaLeida(empleado.idUsuario, id, ahora);
        const adjuntos = await this.prisma.comComunicadoAdjuntos.findMany({
            where: { idVersion: version.idVersion },
            orderBy: { idAdjunto: 'asc' },
        });
        return {
            id: comunicado.idComunicado,
            estado: comunicado.Estado,
            miEstado,
            leidoEn,
            confirmadoEn,
            versionConfirmada,
            tipo: tipoDe(comunicado.ComTiposComunicado),
            prioridad: comunicado.Prioridad,
            acuseModo: comunicado.AcuseModo,
            mostrarModal: comunicado.MostrarModal,
            permitePregunta: comunicado.PermitePregunta,
            requiereIdentidad: comunicado.RequiereIdentidad,
            cta: comunicado.CtaTipo ? { tipo: comunicado.CtaTipo, texto: comunicado.CtaTexto, destino: comunicado.CtaDestino } : null,
            vigenteHasta: comunicado.VigenteHasta,
            enviadoEn: comunicado.EnviadoEn,
            version: {
                id: version.idVersion,
                numVersion: version.NumVersion,
                titulo: version.Titulo,
                resumen: version.Resumen,
                cuerpoHtml: version.CuerpoHtml,
                cuerpoTexto: aTextoPlano(version.CuerpoHtml),
                ...presentarPortada(this.storage, version.PortadaRuta, TTL_ARCHIVO),
                adjuntos: adjuntos.map((adjunto) => presentarAdjunto(this.storage, adjunto, TTL_ARCHIVO)),
            },
        };
    }

    async acusar(activeUser: ActiveUserDto, companyId: number, id: number, contexto: ContextoCliente) {
        const empleado = await this.empleadoDe(activeUser, companyId);
        return this.ack.confirmar({
            companyId,
            idTenant: activeUser.idTenant,
            idComunicado: id,
            idEmpleado: empleado.idEmpleado,
            canal: contexto.canal,
            metodo: 'SESION',
            ip: contexto.ip,
            userAgent: contexto.userAgent,
            dispositivo: contexto.dispositivo,
            zonaHoraria: await this.zonaDe(empleado.idSite),
        });
    }

    async preguntar(activeUser: ActiveUserDto, companyId: number, id: number, pregunta: string) {
        const empleado = await this.empleadoDe(activeUser, companyId);
        const dest = await this.destinatario(empleado.idEmpleado, companyId, activeUser.idTenant, id);
        if (!dest.ComComunicados.PermitePregunta) {
            throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'Este comunicado no admite preguntas.');
        }
        if (dest.ComComunicados.Estado !== 'ENVIADO') {
            throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'Este comunicado ya no admite preguntas.');
        }
        const texto = pregunta.trim();
        if (!texto || texto.length > 1000) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'La pregunta debe tener entre 1 y 1000 caracteres.');
        }
        const cuantas = await this.prisma.comPreguntas.count({ where: { idComunicado: id, idEmpleado: empleado.idEmpleado } });
        if (cuantas >= MAX_PREGUNTAS) {
            throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'Solo puedes enviar 3 preguntas en este comunicado.');
        }
        const creada = await this.prisma.comPreguntas.create({
            data: { idComunicado: id, idEmpleado: empleado.idEmpleado, Pregunta: texto },
        });
        return { id: creada.idPregunta, fechaPregunta: creada.FechaPregunta };
    }

    async misPreguntas(activeUser: ActiveUserDto, companyId: number, id: number) {
        const empleado = await this.empleadoDe(activeUser, companyId);
        await this.destinatario(empleado.idEmpleado, companyId, activeUser.idTenant, id);
        const filas = await this.prisma.comPreguntas.findMany({
            where: { idComunicado: id, idEmpleado: empleado.idEmpleado },
            orderBy: { FechaPregunta: 'desc' },
        });
        return filas.map((fila) => ({
            id: fila.idPregunta,
            pregunta: fila.Pregunta,
            respuesta: fila.Respuesta,
            fechaPregunta: fila.FechaPregunta,
            fechaRespuesta: fila.FechaRespuesta,
            respondida: fila.Respuesta != null,
        }));
    }

    async modalPendiente(activeUser: ActiveUserDto, companyId: number) {
        const empleado = await this.empleadoDe(activeUser, companyId);
        const ahora = this.ahora();
        const ocultos = await this.ocultos(empleado.idEmpleado, await this.zonaDe(empleado.idSite), ahora);
        const filas = await this.prisma.comDestinatarios.findMany({
            where: {
                idEmpleado: empleado.idEmpleado,
                ComComunicados: {
                    idEmpresa: companyId,
                    idTenant: activeUser.idTenant,
                    Estado: 'ENVIADO',
                    MostrarModal: true,
                    OR: [{ VigenteHasta: null }, { VigenteHasta: { gt: ahora } }],
                },
            },
            include: { ComComunicados: { include: { ComTiposComunicado: true } } },
        });
        const elegidas = filas
            .filter((fila) => !ocultos.has(fila.idComunicado) && sigueEnModal(fila))
            .sort((a, b) => (b.ComComunicados.EnviadoEn?.getTime() ?? 0) - (a.ComComunicados.EnviadoEn?.getTime() ?? 0))
            .slice(0, MAX_MODAL);
        const versiones = await this.versionesDe(elegidas.map((fila) => ({ id: fila.idComunicado, num: fila.ComComunicados.VersionActual })));
        const idsVersion = [...versiones.values()].map((version) => version.idVersion);
        const conteos = new Map<number, number>();
        if (idsVersion.length > 0) {
            const grupos = await this.prisma.comComunicadoAdjuntos.groupBy({
                by: ['idVersion'],
                where: { idVersion: { in: idsVersion } },
                _count: { _all: true },
            });
            for (const grupo of grupos) conteos.set(grupo.idVersion, grupo._count._all);
        }
        return elegidas.flatMap((fila) => {
            const version = versiones.get(claveVersion(fila.idComunicado, fila.ComComunicados.VersionActual));
            if (!version) return [];
            return [
                {
                    id: fila.idComunicado,
                    titulo: version.Titulo,
                    resumen: version.Resumen,
                    prioridad: fila.ComComunicados.Prioridad,
                    acuseModo: fila.ComComunicados.AcuseModo,
                    tipo: tipoDe(fila.ComComunicados.ComTiposComunicado),
                    enviadoEn: fila.ComComunicados.EnviadoEn,
                    vigenteHasta: fila.ComComunicados.VigenteHasta,
                    requiereIdentidad: fila.ComComunicados.RequiereIdentidad,
                    totalAdjuntos: conteos.get(version.idVersion) ?? 0,
                },
            ];
        });
    }

    async posponer(activeUser: ActiveUserDto, companyId: number, id: number) {
        const empleado = await this.empleadoDe(activeUser, companyId);
        await this.destinatario(empleado.idEmpleado, companyId, activeUser.idTenant, id);
        const dia = diaLocal(this.ahora(), await this.zonaDe(empleado.idSite));
        try {
            await this.snooze.ocultar(empleado.idEmpleado, dia, id);
        } catch (error) {
            const mensaje = error instanceof Error ? error.message : 'error';
            this.logger.warn(`No se guardó el snooze del empleado ${empleado.idEmpleado}: ${mensaje}`);
            throw errorComms(
                HttpStatus.SERVICE_UNAVAILABLE,
                'COLA_NO_DISPONIBLE',
                'No se pudo ocultar el modal; intenta de nuevo en unos minutos.',
            );
        }
        return { dia, ttlSegundos: TTL_SNOOZE_SEGUNDOS };
    }

    private async empleadoDe(activeUser: ActiveUserDto, companyId: number) {
        const empleado = await this.prisma.empleados.findFirst({
            where: { idUsuario: activeUser.uuid, idEmpresa: companyId, idTenant: activeUser.idTenant, activo: true },
            select: { idEmpleado: true, idUsuario: true, idSite: true },
        });
        if (!empleado) {
            throw errorComms(HttpStatus.NOT_FOUND, 'EMPLEADO_NO_ENCONTRADO', 'No encontramos tu perfil de empleado en esta empresa.');
        }
        return empleado;
    }

    private async destinatario(idEmpleado: number, companyId: number, idTenant: number, idComunicado: number) {
        const dest = await this.prisma.comDestinatarios.findFirst({
            where: { idEmpleado, idComunicado },
            include: { ComComunicados: { include: { ComTiposComunicado: true } } },
        });
        const comunicado = dest?.ComComunicados;
        const visible = comunicado && ['ENVIADO', 'ENVIANDO', 'EXPIRADO', 'ARCHIVADO'].includes(comunicado.Estado);
        if (!dest || !comunicado || comunicado.idEmpresa !== companyId || comunicado.idTenant !== idTenant || !visible) {
            throw errorComms(HttpStatus.NOT_FOUND, 'NO_DESTINATARIO', 'No eres destinatario de este comunicado.');
        }
        return dest;
    }

    private async versionVigente(idComunicado: number, numVersion: number) {
        const version = await this.prisma.comComunicadoVersiones.findUnique({
            where: { idComunicado_NumVersion: { idComunicado, NumVersion: numVersion } },
        });
        if (!version || version.NumVersion !== numVersion) {
            throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'La confirmación solo aplica a la versión vigente.');
        }
        return version;
    }

    private async versionesDe(pares: { id: number; num: number }[]) {
        const mapa = new Map<string, { idVersion: number; Titulo: string; Resumen: string }>();
        if (!pares.length) return mapa;
        const filas = await this.prisma.comComunicadoVersiones.findMany({
            where: { OR: pares.map((par) => ({ idComunicado: par.id, NumVersion: par.num })) },
            select: { idVersion: true, idComunicado: true, NumVersion: true, Titulo: true, Resumen: true },
        });
        for (const fila of filas) mapa.set(claveVersion(fila.idComunicado, fila.NumVersion), fila);
        return mapa;
    }

    private async marcarLeido(
        dest: { idDestinatario: number; LeidoEn: Date | null; Estado: string },
        ahora: Date,
    ): Promise<Date> {
        const leidoEn = dest.LeidoEn ?? ahora;
        const estado = dest.Estado === 'CONFIRMADO' || dest.Estado === 'EXPIRADO' ? dest.Estado : 'LEIDO';
        if (dest.LeidoEn && dest.Estado === estado) return dest.LeidoEn;
        await this.prisma.comDestinatarios.update({
            where: { idDestinatario: dest.idDestinatario },
            data: { LeidoEn: leidoEn, Estado: estado as 'LEIDO' | 'CONFIRMADO' | 'EXPIRADO' },
        });
        return leidoEn;
    }

    private async marcarEntregaLeida(userUuid: string | null, idComunicado: number, ahora: Date): Promise<void> {
        if (!userUuid) return;
        try {
            const avisos = await this.prisma.notificaciones.findMany({
                where: { user_uuid: userUuid, OrigenTipo: ORIGEN, OrigenId: String(idComunicado) },
                select: { id: true },
            });
            if (!avisos.length) return;
            const ids = avisos.map((aviso) => aviso.id);
            await this.prisma.notificaciones.updateMany({
                where: { id: { in: ids }, read_at: null },
                data: { read_at: ahora },
            });
            const canal = await this.prisma.catCanalesNotificaciones.findUnique({ where: { code: 'SOCKETS' } });
            if (!canal) return;
            await this.prisma.notificacionesEntregas.updateMany({
                where: { notification_id: { in: ids }, channel_id: canal.id, status: { in: ['SENT', 'PENDIENTE'] } },
                data: { status: 'LEIDO' },
            });
        } catch (error) {
            const mensaje = error instanceof Error ? error.message : 'error';
            this.logger.warn(`No se marcó leída la entrega del comunicado ${idComunicado}: ${mensaje}`);
        }
    }

    private async zonaDe(idSite: number | null): Promise<string> {
        if (!idSite) return ZONA_DEFAULT;
        const site = await this.prisma.catSites.findUnique({ where: { idSite }, select: { zonaHoraria: true } });
        return site?.zonaHoraria || ZONA_DEFAULT;
    }

    private async ocultos(idEmpleado: number, zona: string, ahora: Date): Promise<Set<number>> {
        try {
            return new Set(await this.snooze.ids(idEmpleado, diaLocal(ahora, zona)));
        } catch (error) {
            const mensaje = error instanceof Error ? error.message : 'error';
            this.logger.warn(`No se leyó el snooze del empleado ${idEmpleado}: ${mensaje}`);
            return new Set();
        }
    }
}

function sigueEnModal(fila: { LeidoEn: Date | null; Estado: string; ComComunicados: { AcuseModo: string } }): boolean {
    if (fila.ComComunicados.AcuseModo === 'NINGUNO') return fila.LeidoEn == null;
    return fila.Estado !== 'CONFIRMADO' && fila.Estado !== 'EXPIRADO';
}

function claveVersion(id: number, num: number): string {
    return `${id}:${num}`;
}

function tipoDe(tipo: { idTipo: number; Codigo: string; Nombre: string; EsCorto: boolean }) {
    return { id: tipo.idTipo, codigo: tipo.Codigo, nombre: tipo.Nombre, esCorto: tipo.EsCorto };
}

function tarjeta(
    fila: {
        Estado: string;
        LeidoEn: Date | null;
        ConfirmadoEn: Date | null;
        VersionConfirmada: number | null;
        ComComunicados: {
            idComunicado: number;
            Estado: string;
            Prioridad: string;
            AcuseModo: string;
            MostrarModal: boolean;
            PermitePregunta: boolean;
            VigenteHasta: Date | null;
            EnviadoEn: Date | null;
            VersionActual: number;
            ComTiposComunicado: { idTipo: number; Codigo: string; Nombre: string; EsCorto: boolean };
        };
    },
    version: { Titulo: string; Resumen: string },
) {
    const comunicado = fila.ComComunicados;
    return {
        id: comunicado.idComunicado,
        titulo: version.Titulo,
        resumen: version.Resumen,
        estado: comunicado.Estado,
        miEstado: fila.Estado,
        leidoEn: fila.LeidoEn,
        confirmadoEn: fila.ConfirmadoEn,
        versionConfirmada: fila.VersionConfirmada,
        versionActual: comunicado.VersionActual,
        prioridad: comunicado.Prioridad,
        acuseModo: comunicado.AcuseModo,
        mostrarModal: comunicado.MostrarModal,
        permitePregunta: comunicado.PermitePregunta,
        vigenteHasta: comunicado.VigenteHasta,
        enviadoEn: comunicado.EnviadoEn,
        tipo: tipoDe(comunicado.ComTiposComunicado),
    };
}

