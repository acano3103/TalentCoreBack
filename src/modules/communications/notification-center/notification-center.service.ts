import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { formatNotificationPayload } from 'src/modules/notifications/maps/websocket-map';
import { CampanaRealtimeService } from 'src/modules/notifications/campana-realtime.service';
import { whereNoLeidas } from 'src/modules/notifications/campana';
import { PrismaService } from 'src/prisma/prisma.service';
import { errorComms, esP2002 } from '../comms-http';
import { agruparAvisos, AvisoPlano, PAGINA_CAMPANA } from './agrupar';
import { GuardarPreferenciasDto, ListarNotificacionesQuery, RegistrarPushTokenDto } from './dto/notificaciones.dto';
import {
    CANALES_PREFERENCIA,
    CanalPreferencia,
    CATEGORIAS_PREFERENCIA,
    CategoriaPreferencia,
    codigoCanalCatalogo,
    preferenciaBloqueada,
} from './preferencias-reglas';

const TRANSACCION = { maxWait: 15_000, timeout: 60_000 };
const ZONA_DEFAULT = 'America/Mexico_City';
const MAX_AVISOS = 500;

@Injectable()
export class NotificationCenterService {
    ahora: () => Date = () => new Date();

    constructor(
        private readonly prisma: PrismaService,
        private readonly campana: CampanaRealtimeService,
    ) {}

    async listar(activeUser: ActiveUserDto, companyId: number, query: ListarNotificacionesQuery) {
        const empleado = await this.empleadoDe(activeUser, companyId);
        const zona = await this.zonaDe(empleado.idSite);
        const tab = query.tab ?? 'unread';
        const page = query.page ?? 1;
        const ahora = this.ahora();
        const filas = await this.prisma.notificaciones.findMany({
            where: whereListado({
                userUuid: activeUser.uuid,
                companyId,
                idTenant: activeUser.idTenant,
                tab,
                categoria: query.category,
                ahora,
            }),
            orderBy: { created_at: 'desc' },
            take: MAX_AVISOS,
            include: { CatTipoNotificacion: { select: { code: true } } },
        });
        const avisos: AvisoPlano[] = filas.map((fila) => ({
            id: fila.id,
            titulo: fila.title,
            mensaje: mensajeVisible(fila.title, fila.message, fila.CatTipoNotificacion?.code ?? null),
            categoria: fila.Categoria,
            prioridad: fila.Prioridad,
            deepLink: fila.DeepLink,
            origenTipo: fila.OrigenTipo,
            origenId: fila.OrigenId,
            claveAgrupacion: fila.ClaveAgrupacion,
            creadoEn: fila.created_at,
            leidaEn: fila.read_at,
        }));
        return agruparAvisos(avisos, ahora, zona, page, PAGINA_CAMPANA);
    }

    conteo(activeUser: ActiveUserDto, companyId: number) {
        return this.campana.conteo(activeUser.uuid, companyId, activeUser.idTenant, this.ahora());
    }

    async marcarLeida(activeUser: ActiveUserDto, companyId: number, id: string) {
        const aviso = await this.avisoPropio(activeUser, companyId, id);
        if (aviso.read_at) return { id: aviso.id, leida: true, leidaEn: aviso.read_at };
        const leidaEn = this.ahora();
        await this.prisma.notificaciones.update({
            where: { id: aviso.id },
            data: { read_at: leidaEn },
        });
        await this.campana.publicar(activeUser.uuid, companyId, activeUser.idTenant);
        return { id: aviso.id, leida: true, leidaEn };
    }

    async marcarTodas(activeUser: ActiveUserDto, companyId: number, category?: string) {
        const ahora = this.ahora();
        const resultado = await this.prisma.notificaciones.updateMany({
            where: whereNoLeidas({
                userUuid: activeUser.uuid,
                companyId,
                idTenant: activeUser.idTenant,
                ahora,
                categoria: category,
            }),
            data: { read_at: ahora },
        });
        if (resultado.count > 0) await this.campana.publicar(activeUser.uuid, companyId, activeUser.idTenant);
        return { actualizadas: resultado.count };
    }

    async preferencias(activeUser: ActiveUserDto) {
        const canales = await this.canales();
        const filas = await this.prisma.preferenciasNotificacionesUsuario.findMany({
            where: { user_uuid: activeUser.uuid, categoria: { in: [...CATEGORIAS_PREFERENCIA] } },
        });
        return { preferencias: matriz(filas, canales) };
    }

    async guardarPreferencias(activeUser: ActiveUserDto, dto: GuardarPreferenciasDto) {
        const apagada = dto.preferencias.find((fila) => !fila.activa && preferenciaBloqueada(fila.categoria, fila.canal));
        if (apagada) {
            throw errorComms(
                HttpStatus.BAD_REQUEST,
                'PREFERENCIA_BLOQUEADA',
                'Este aviso siempre se envía. No puedes apagarlo.',
                { categoria: apagada.categoria, canal: apagada.canal },
            );
        }
        const canales = await this.canales();
        const ahora = this.ahora();
        const unicas = new Map<string, (typeof dto.preferencias)[number]>();
        for (const fila of dto.preferencias) unicas.set(`${fila.categoria}|${fila.canal}`, fila);
        await this.prisma.$transaction(async (tx) => {
            for (const fila of unicas.values()) {
                const channelId = canales.get(codigoCanalCatalogo(fila.canal));
                if (!channelId) {
                    throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'Ese canal de notificación no está configurado.');
                }
                await guardarCelda(tx, activeUser.uuid, channelId, fila.categoria, fila.activa, ahora);
            }
        }, TRANSACCION);
        return this.preferencias(activeUser);
    }

    async registrarToken(activeUser: ActiveUserDto, companyId: number, dto: RegistrarPushTokenDto) {
        const empleado = await this.empleadoDe(activeUser, companyId);
        const token = dto.token.trim();
        const data = {
            user_uuid: activeUser.uuid,
            idEmpleado: empleado.idEmpleado,
            Plataforma: dto.plataforma,
            Dispositivo: dto.dispositivo?.trim() || null,
            Activo: true,
            FechaBaja: null,
            MotivoBaja: null,
            UltimoUso: this.ahora(),
        };
        try {
            const fila = await this.prisma.$transaction(async (tx) => {
                const ya = await tx.pushTokens.findUnique({ where: { Token: token } });
                if (ya) {
                    return tx.pushTokens.update({ where: { idPushToken: ya.idPushToken }, data });
                }
                return tx.pushTokens.create({ data: { ...data, Token: token } });
            }, TRANSACCION);
            return dispositivoDe(fila);
        } catch (error) {
            if (!esP2002(error)) throw error;
            const fila = await this.prisma.pushTokens.update({ where: { Token: token }, data });
            return dispositivoDe(fila);
        }
    }

    async bajaToken(activeUser: ActiveUserDto, tokenCrudo: string) {
        const token = decodeURIComponent(tokenCrudo).trim();
        const ya = await this.prisma.pushTokens.findFirst({
            where: { Token: token, user_uuid: activeUser.uuid },
        });
        if (!ya) {
            throw errorComms(HttpStatus.NOT_FOUND, 'DISPOSITIVO_NO_ENCONTRADO', 'No encontramos ese dispositivo.');
        }
        await this.prisma.pushTokens.update({
            where: { idPushToken: ya.idPushToken },
            data: { Activo: false, FechaBaja: this.ahora(), MotivoBaja: 'USUARIO' },
        });
        return { token, activo: false };
    }

    async dispositivos(activeUser: ActiveUserDto) {
        const filas = await this.prisma.pushTokens.findMany({
            where: { user_uuid: activeUser.uuid, Activo: true, FechaBaja: null },
            orderBy: { UltimoUso: 'desc' },
        });
        return { dispositivos: filas.map(dispositivoDe) };
    }

    private async avisoPropio(activeUser: ActiveUserDto, companyId: number, id: string) {
        const aviso = await this.prisma.notificaciones.findFirst({
            where: {
                id,
                user_uuid: activeUser.uuid,
                OR: [{ idEmpresa: companyId }, { idEmpresa: null }],
                AND: [{ OR: [{ idTenant: activeUser.idTenant }, { idTenant: null }] }],
            },
        });
        if (!aviso) {
            throw errorComms(HttpStatus.NOT_FOUND, 'NOTIFICACION_NO_ENCONTRADA', 'No encontramos esa notificación.');
        }
        return aviso;
    }

    private async empleadoDe(activeUser: ActiveUserDto, companyId: number) {
        const empleado = await this.prisma.empleados.findFirst({
            where: { idUsuario: activeUser.uuid, idEmpresa: companyId, idTenant: activeUser.idTenant, activo: true },
            select: { idEmpleado: true, idSite: true },
        });
        if (!empleado) {
            throw errorComms(HttpStatus.NOT_FOUND, 'EMPLEADO_NO_ENCONTRADO', 'No encontramos tu perfil de empleado en esta empresa.');
        }
        return empleado;
    }

    private async zonaDe(idSite: number | null): Promise<string> {
        if (!idSite) return ZONA_DEFAULT;
        const site = await this.prisma.catSites.findUnique({ where: { idSite }, select: { zonaHoraria: true } });
        return site?.zonaHoraria || ZONA_DEFAULT;
    }

    private async canales(): Promise<Map<string, number>> {
        const filas = await this.prisma.catCanalesNotificaciones.findMany({
            where: { code: { in: ['PUSH', 'EMAIL', 'WHATSAPP'] } },
            select: { id: true, code: true },
        });
        return new Map(filas.map((fila) => [fila.code, fila.id]));
    }
}

function whereListado(filtro: {
    userUuid: string;
    companyId: number;
    idTenant: number;
    tab: 'unread' | 'all' | 'done';
    categoria?: string;
    ahora: Date;
}): Prisma.NotificacionesWhereInput {
    const alcance: Prisma.NotificacionesWhereInput[] = [
        { user_uuid: filtro.userUuid },
        { OR: [{ idEmpresa: filtro.companyId }, { idEmpresa: null }] },
        { OR: [{ idTenant: filtro.idTenant }, { idTenant: null }] },
    ];
    if (filtro.tab === 'unread') {
        alcance.push({ read_at: null }, { OR: [{ ExpiraEn: null }, { ExpiraEn: { gt: filtro.ahora } }] });
    } else if (filtro.tab === 'done') {
        alcance.push({ read_at: { not: null } });
    }
    const categoria = filtro.categoria?.trim();
    if (categoria) alcance.push({ Categoria: categoria });
    return { AND: alcance };
}

function mensajeVisible(titulo: string | null, crudo: string | null, tipo: string | null): string {
    const texto = (crudo ?? '').trim();
    if (!texto.startsWith('{') && !texto.startsWith('[')) return texto;
    try {
        return formatNotificationPayload(tipo || 'UNKNOWN', JSON.parse(texto), titulo ?? undefined).message;
    } catch {
        return texto;
    }
}

function matriz(
    filas: { channel_id: number; categoria: string | null; enabled: boolean | null }[],
    canales: Map<string, number>,
) {
    const elegidas = new Map<string, boolean>();
    for (const fila of filas) {
        if (!fila.categoria) continue;
        elegidas.set(`${fila.categoria}|${fila.channel_id}`, fila.enabled !== false);
    }
    const preferencias: {
        categoria: CategoriaPreferencia;
        canal: CanalPreferencia;
        activa: boolean;
        bloqueada: boolean;
    }[] = [];
    for (const categoria of CATEGORIAS_PREFERENCIA) {
        for (const canal of CANALES_PREFERENCIA) {
            const bloqueada = preferenciaBloqueada(categoria, canal);
            const channelId = canales.get(codigoCanalCatalogo(canal));
            const guardada = channelId === undefined ? undefined : elegidas.get(`${categoria}|${channelId}`);
            preferencias.push({
                categoria,
                canal,
                activa: bloqueada ? true : (guardada ?? true),
                bloqueada,
            });
        }
    }
    return preferencias;
}

async function guardarCelda(
    tx: Prisma.TransactionClient,
    userUuid: string,
    channelId: number,
    categoria: CategoriaPreferencia,
    activa: boolean,
    ahora: Date,
) {
    const ya = await tx.preferenciasNotificacionesUsuario.findFirst({
        where: { user_uuid: userUuid, channel_id: channelId, categoria },
    });
    if (ya) {
        await tx.preferenciasNotificacionesUsuario.update({
            where: { id: ya.id },
            data: { enabled: activa, updated_at: ahora },
        });
        return;
    }
    await tx.preferenciasNotificacionesUsuario.create({
        data: { user_uuid: userUuid, channel_id: channelId, categoria, enabled: activa, updated_at: ahora },
    });
}

function dispositivoDe(fila: {
    idPushToken: number;
    Token: string;
    Plataforma: string;
    Dispositivo: string | null;
    Activo: boolean;
    UltimoUso: Date | null;
}) {
    return {
        id: fila.idPushToken,
        token: fila.Token,
        plataforma: fila.Plataforma,
        dispositivo: fila.Dispositivo,
        activo: fila.Activo,
        ultimoUso: fila.UltimoUso,
    };
}
