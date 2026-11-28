import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { AudienceResolverService } from '../audiences/audience-resolver.service';
import { CriteriosAudiencia } from '../audiences/criterios';
import { prepararContenido } from '../announcements/contenido';
import { CommsCapabilityService } from '../capabilities/comms-capability.service';
import { politicaPermiteWhatsapp } from '../channels/canales';
import { EffectiveChannelService } from '../channels/effective-channel.service';
import { errorComms } from '../comms-http';
import { AnnouncementDispatchService } from '../delivery/announcement-dispatch.service';
import { resolverPlantillaWhatsApp } from '../delivery/plantilla-wa';
import { WhatsAppCapService } from '../whatsapp-usage/whatsapp-cap.service';
import { rangoDiaLocal } from './bandeja';
import { CrearAvisoEquipoDto } from './dto/team-notice.dto';
import { canalesConWhatsapp, htmlDeTextoPlano, LIMITE_AVISOS_DIA, planEquipo, resumenDe } from './team-notice.plan';

const TIPO = 'AVISO_EQUIPO';
const ZONA_DEFAULT = 'America/Mexico_City';
const ULTIMOS = 20;
const TRANSACCION = { maxWait: 15_000, timeout: 60_000 };

export interface VistaEquipo {
    total: number;
    conApp: number;
    soloWeb: number;
    porWhatsApp: number;
    sinCanal: number;
    costoWhatsAppEstimado: number | null;
    plantillaDisponible: boolean;
}

export interface AvisoEnviado {
    id: number;
    titulo: string;
    enviadoEn: Date | null;
    leidos: number;
    total: number;
    acuses: number;
}

@Injectable()
export class TeamNoticeService {
    ahora: () => Date = () => new Date();

    constructor(
        private readonly prisma: PrismaService,
        private readonly capabilities: CommsCapabilityService,
        private readonly resolver: AudienceResolverService,
        private readonly canales: EffectiveChannelService,
        private readonly envio: AnnouncementDispatchService,
        private readonly caps: WhatsAppCapService,
    ) {}

    async vistaPrevia(activeUser: ActiveUserDto, companyId: number, whatsappSinApp: boolean): Promise<VistaEquipo> {
        const criterios = await this.criteriosDe(activeUser, companyId);
        const scope = await this.capabilities.contexto('COM_CREAR', activeUser, companyId);
        const [resuelto, config] = await Promise.all([
            this.resolver.resolve(criterios, scope),
            this.prisma.comConfigEmpresa.findUnique({ where: { idEmpresa: companyId } }),
        ]);
        const politica = politicaPermiteWhatsapp(config?.PoliticaWhatsApp);
        const efectivos = await this.canales.forEmployees(resuelto.ids, companyId);
        const telefonos = await this.telefonosDe(resuelto.ids);
        const porEmpleado = new Map(efectivos.porEmpleado.map((fila) => [fila.idEmpleado, fila.canales]));
        const plan = planEquipo(
            resuelto.ids.map((id) => ({
                canales: canalesConWhatsapp(porEmpleado.get(id) ?? [], telefonos.has(id), false, false),
                telefono: telefonos.has(id),
            })),
            whatsappSinApp,
            politica,
        );
        const precio = await this.caps.precioActual(activeUser.idTenant, this.ahora(), 'NORMAL');
        return {
            ...plan,
            costoWhatsAppEstimado: precio ? redondear(precio.precio * plan.porWhatsApp) : null,
            plantillaDisponible: resolverPlantillaWhatsApp(config?.PlantillasWhatsApp, TIPO, 'NORMAL') != null,
        };
    }

    async crear(activeUser: ActiveUserDto, companyId: number, dto: CrearAvisoEquipoDto) {
        const criterios = await this.criteriosDe(activeUser, companyId);
        await this.exigirCupo(activeUser, companyId);
        const scope = await this.capabilities.contexto('COM_CREAR', activeUser, companyId);
        const resuelto = await this.resolver.resolve(criterios, scope);
        if (!resuelto.ids.length) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'AUDIENCIA_VACIA', 'Tu equipo directo no tiene personas.');
        }
        const titulo = dto.titulo.trim();
        const mensaje = dto.mensaje.trim();
        if (!titulo || !mensaje) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'Escribe el título y el mensaje.');
        }
        const tipo = await this.prisma.comTiposComunicado.findFirst({
            where: { idTenant: activeUser.idTenant, Codigo: TIPO, Activo: true },
        });
        if (!tipo) throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos el tipo de aviso de equipo.');
        const contenido = prepararContenido(
            { titulo, resumen: resumenDe(mensaje), cuerpoHtml: htmlDeTextoPlano(mensaje) },
            false,
            true,
        );
        const id = await this.prisma.$transaction(async (tx) => {
            const comunicado = await tx.comComunicados.create({
                data: {
                    idTenant: activeUser.idTenant,
                    idEmpresa: companyId,
                    idTipo: tipo.idTipo,
                    Estado: 'BORRADOR',
                    Prioridad: 'NORMAL',
                    AcuseModo: dto.pedirConfirmacion ? 'LEI_ENTENDI' : 'NINGUNO',
                    MostrarModal: false,
                    RequiereIdentidad: false,
                    IncluirNuevos: false,
                    PermitePregunta: false,
                    CriteriosAudiencia: jsonCriterios(criterios),
                    CreadoPor: activeUser.uuid,
                },
            });
            await tx.comComunicadoVersiones.create({
                data: {
                    idComunicado: comunicado.idComunicado,
                    NumVersion: 1,
                    Titulo: contenido.titulo,
                    Resumen: contenido.resumen,
                    CuerpoHtml: contenido.cuerpoHtml,
                    CreadoPor: activeUser.uuid,
                },
            });
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, comunicado.idComunicado, `envió un aviso a su equipo: ${contenido.titulo}.`),
            });
            return comunicado.idComunicado;
        }, TRANSACCION);
        const publicado = await this.envio.enviar(
            activeUser,
            companyId,
            id,
            dto.whatsappSinApp ? { whatsappSinApp: true } : undefined,
        );
        return {
            id: publicado.id,
            totalDestinatarios: publicado.totalDestinatarios,
            whatsapp: publicado.whatsapp ?? { enviados: 0 },
        };
    }

    async listar(activeUser: ActiveUserDto, companyId: number): Promise<{ items: AvisoEnviado[] }> {
        await this.exigirTipo(activeUser, companyId);
        const filas = await this.prisma.comComunicados.findMany({
            where: {
                idTenant: activeUser.idTenant,
                idEmpresa: companyId,
                CreadoPor: activeUser.uuid,
                ComTiposComunicado: { Codigo: TIPO },
            },
            orderBy: { FechaRegistro: 'desc' },
            take: ULTIMOS,
            include: { ComComunicadoVersiones: { select: { NumVersion: true, Titulo: true } } },
        });
        const ids = filas.map((fila) => fila.idComunicado);
        const [leidos, acuses] = await Promise.all([
            this.contar(ids, { LeidoEn: { not: null } }),
            this.contar(ids, { ConfirmadoEn: { not: null } }),
        ]);
        return {
            items: filas.map((fila) => {
                const version = fila.ComComunicadoVersiones.find((item) => item.NumVersion === fila.VersionActual);
                return {
                    id: fila.idComunicado,
                    titulo: version?.Titulo ?? '',
                    enviadoEn: fila.EnviadoEn,
                    leidos: leidos.get(fila.idComunicado) ?? 0,
                    total: fila.TotalDestinatarios,
                    acuses: acuses.get(fila.idComunicado) ?? 0,
                };
            }),
        };
    }

    private async criteriosDe(activeUser: ActiveUserDto, companyId: number): Promise<CriteriosAudiencia> {
        await this.exigirTipo(activeUser, companyId);
        const empleado = await this.prisma.empleados.findFirst({
            where: { idUsuario: activeUser.uuid, idEmpresa: companyId, idTenant: activeUser.idTenant, activo: true },
            select: { idEmpleado: true },
        });
        if (!empleado) {
            throw errorComms(HttpStatus.NOT_FOUND, 'EMPLEADO_NO_ENCONTRADO', 'No encontramos tu perfil de empleado en esta empresa.');
        }
        return { jefes: [{ idEmpleado: empleado.idEmpleado, alcance: 'DIRECTO' }] };
    }

    private async exigirTipo(activeUser: ActiveUserDto, companyId: number): Promise<void> {
        const efectivas = await this.capabilities.getEffective(activeUser, companyId);
        const crear = efectivas.find((item) => item.codigo === 'COM_CREAR');
        if (!crear) {
            throw errorComms(HttpStatus.FORBIDDEN, 'SIN_CAPACIDAD', 'No tienes permiso para avisar a tu equipo.');
        }
        if (crear.tiposPermitidos && !crear.tiposPermitidos.includes(TIPO)) {
            throw errorComms(HttpStatus.FORBIDDEN, 'TIPO_NO_PERMITIDO', 'Tu rol no puede enviar avisos de equipo.');
        }
    }

    private async exigirCupo(activeUser: ActiveUserDto, companyId: number): Promise<void> {
        const empleado = await this.prisma.empleados.findFirst({
            where: { idUsuario: activeUser.uuid, idEmpresa: companyId, idTenant: activeUser.idTenant, activo: true },
            select: { idSite: true },
        });
        const zona = empleado?.idSite
            ? (await this.prisma.catSites.findUnique({ where: { idSite: empleado.idSite }, select: { zonaHoraria: true } }))?.zonaHoraria
            : null;
        const rango = rangoDiaLocal(this.ahora(), zona || ZONA_DEFAULT);
        const enviados = await this.prisma.comComunicados.count({
            where: {
                idTenant: activeUser.idTenant,
                idEmpresa: companyId,
                CreadoPor: activeUser.uuid,
                FechaRegistro: { gte: rango.inicio, lt: rango.fin },
                ComTiposComunicado: { Codigo: TIPO },
            },
        });
        if (enviados >= LIMITE_AVISOS_DIA) {
            throw errorComms(
                HttpStatus.TOO_MANY_REQUESTS,
                'LIMITE_AVISOS',
                `Puedes enviar hasta ${LIMITE_AVISOS_DIA} avisos a tu equipo por día.`,
            );
        }
    }

    private async telefonosDe(ids: number[]): Promise<Set<number>> {
        if (!ids.length) return new Set();
        const filas = await this.prisma.empleados.findMany({
            where: { idEmpleado: { in: ids }, activo: true },
            select: { idEmpleado: true, telefonoMovil: true },
        });
        return new Set(filas.filter((fila) => fila.telefonoMovil?.trim()).map((fila) => fila.idEmpleado));
    }

    private async contar(ids: number[], extra: Prisma.ComDestinatariosWhereInput): Promise<Map<number, number>> {
        const mapa = new Map<number, number>();
        if (!ids.length) return mapa;
        const filas = await this.prisma.comDestinatarios.groupBy({
            by: ['idComunicado'],
            where: { idComunicado: { in: ids }, ...extra },
            _count: { idDestinatario: true },
        });
        for (const fila of filas) mapa.set(fila.idComunicado, fila._count.idDestinatario);
        return mapa;
    }
}

function jsonCriterios(criterios: CriteriosAudiencia): Prisma.InputJsonValue {
    return criterios as unknown as Prisma.InputJsonValue;
}

function bitacora(activeUser: ActiveUserDto, companyId: number, id: number, verbo: string) {
    return {
        idUsuario: activeUser.id,
        idEmpresa: companyId,
        accion: 'CREAR',
        tablaOrigen: 'ComComunicados',
        idRegistro: String(id),
        descripcion: `${activeUser.first_name} ${activeUser.last_name} ${verbo}`,
        fechaCreacion: new Date(),
    };
}

function redondear(valor: number): number {
    return Math.round(valor * 10_000) / 10_000;
}
