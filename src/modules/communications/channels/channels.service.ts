import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { errorComms, esP2002 } from '../comms-http';
import { CommsCapabilityService } from '../capabilities/comms-capability.service';
import { empresasPermitidas } from '../audiences/criterios';
import { consultaEmpleadoEnAlcance } from '../audiences/alcance-sql';
import { EffectiveChannelService } from './effective-channel.service';
import { Canal, normalizarCanales, POLITICA_WHATSAPP_DEFAULT } from './canales';
import { ActualizarExcepcionDto, ExcepcionCanalDto, MatrizCanalesDto } from './dto/channel-profile.dto';
import { ActualizarChannelConfigDto } from './dto/channel-config.dto';

const TRANSACCION = { maxWait: 15_000, timeout: 20_000 };

export interface ConfigCanales {
    politicaWhatsApp: string;
    escalaImportanteMin: number;
    escalaCriticaMin: number;
    escalaCorreoMin: number;
    silencioActivo: boolean;
    silencioInicio: string;
    silencioFin: string;
    limiteDiarioRecordatorios: number;
    jefesAvisoEquipo: boolean;
    plantillasWhatsApp: unknown;
}

export interface PerfilRespuesta {
    id: number;
    nivel: 'EMPLEADO' | 'UBICACION' | 'TIPO_PERSONAL';
    idReferencia: number;
    nombre: string;
    canales: Canal[];
    nota: string | null;
}

@Injectable()
export class ChannelsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly capabilities: CommsCapabilityService,
        private readonly efectivos: EffectiveChannelService,
    ) {}

    async obtenerConfig(activeUser: ActiveUserDto, companyId: number): Promise<ConfigCanales> {
        await this.capabilities.contexto('CFG_CANALES', activeUser, companyId);
        const fila = await this.asegurarConfig(activeUser.idTenant, companyId);
        return aConfig(fila);
    }

    async actualizarConfig(
        activeUser: ActiveUserDto,
        companyId: number,
        dto: ActualizarChannelConfigDto,
    ): Promise<ConfigCanales> {
        await this.capabilities.contexto('CFG_CANALES', activeUser, companyId);
        await this.asegurarConfig(activeUser.idTenant, companyId);
        const data = datosConfig(dto);
        if (!Object.keys(data).length) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'Indica al menos un valor de la configuración.');
        }
        const fila = await this.prisma.$transaction(async (tx) => {
            const actualizada = await tx.comConfigEmpresa.update({ where: { idEmpresa: companyId }, data });
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, 'ComConfigEmpresa', companyId, 'actualizó la configuración de canales.'),
            });
            return actualizada;
        }, TRANSACCION);
        return aConfig(fila);
    }

    async perfiles(activeUser: ActiveUserDto, companyId: number, nivel: string): Promise<PerfilRespuesta[]> {
        await this.capabilities.contexto('CFG_CANALES', activeUser, companyId);
        if (nivel !== 'EMPLEADO' && nivel !== 'UBICACION' && nivel !== 'TIPO_PERSONAL') {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'El nivel de perfil no es válido.');
        }
        const filas = await this.prisma.comPerfilesCanal.findMany({
            where: { idEmpresa: companyId, idTenant: activeUser.idTenant, Nivel: nivel },
            orderBy: { idReferencia: 'asc' },
        });
        const nombres = await this.nombres(activeUser.idTenant, nivel, filas.map((fila) => fila.idReferencia));
        return filas.map((fila) => aPerfil(fila, nombres.get(fila.idReferencia) ?? ''));
    }

    async reemplazarMatriz(
        activeUser: ActiveUserDto,
        companyId: number,
        dto: MatrizCanalesDto,
    ): Promise<PerfilRespuesta[]> {
        await this.capabilities.contexto('CFG_CANALES', activeUser, companyId);
        const repetido = dto.filas.find(
            (fila, indice) => dto.filas.findIndex((otra) => otra.idReferencia === fila.idReferencia) !== indice,
        );
        if (repetido) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'Hay un tipo de personal repetido en la matriz.');
        }
        const ids = dto.filas.map((fila) => fila.idReferencia);
        if (ids.length) {
            const existentes = await this.prisma.catTiposPersonal.findMany({
                where: { idTenant: activeUser.idTenant, idTipoPersonal: { in: ids } },
                select: { idTipoPersonal: true },
            });
            const ok = new Set(existentes.map((fila) => fila.idTipoPersonal));
            const invalidos = ids.filter((id) => !ok.has(id));
            if (invalidos.length) {
                throw errorComms(
                    HttpStatus.BAD_REQUEST,
                    'CONTENIDO_INVALIDO',
                    'Hay tipos de personal que no existen.',
                    { ids: invalidos },
                );
            }
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.comPerfilesCanal.deleteMany({
                where: { idEmpresa: companyId, idTenant: activeUser.idTenant, Nivel: 'TIPO_PERSONAL' },
            });
            if (dto.filas.length) {
                await tx.comPerfilesCanal.createMany({
                    data: dto.filas.map((fila) => ({
                        idTenant: activeUser.idTenant,
                        idEmpresa: companyId,
                        Nivel: 'TIPO_PERSONAL' as const,
                        idReferencia: fila.idReferencia,
                        Canales: normalizarCanales(fila.canales),
                    })),
                });
            }
            await tx.historicoMovimientos.create({
                data: bitacora(
                    activeUser,
                    companyId,
                    'ComPerfilesCanal',
                    companyId,
                    'actualizó la matriz de canales por tipo de personal.',
                ),
            });
        }, TRANSACCION);
        return this.perfiles(activeUser, companyId, 'TIPO_PERSONAL');
    }

    async excepciones(activeUser: ActiveUserDto, companyId: number): Promise<PerfilRespuesta[]> {
        await this.capabilities.contexto('CFG_CANALES', activeUser, companyId);
        const filas = await this.prisma.comPerfilesCanal.findMany({
            where: {
                idEmpresa: companyId,
                idTenant: activeUser.idTenant,
                Nivel: { in: ['EMPLEADO', 'UBICACION'] },
            },
            orderBy: [{ Nivel: 'asc' }, { idReferencia: 'asc' }],
        });
        const empleados = filas.filter((fila) => fila.Nivel === 'EMPLEADO').map((fila) => fila.idReferencia);
        const sites = filas.filter((fila) => fila.Nivel === 'UBICACION').map((fila) => fila.idReferencia);
        const [nombresEmpleado, nombresSite] = await Promise.all([
            this.nombres(activeUser.idTenant, 'EMPLEADO', empleados),
            this.nombres(activeUser.idTenant, 'UBICACION', sites),
        ]);
        return filas.map((fila) =>
            aPerfil(fila, (fila.Nivel === 'EMPLEADO' ? nombresEmpleado : nombresSite).get(fila.idReferencia) ?? ''),
        );
    }

    async crearExcepcion(
        activeUser: ActiveUserDto,
        companyId: number,
        dto: ExcepcionCanalDto,
    ): Promise<PerfilRespuesta> {
        const scope = await this.capabilities.contexto('CFG_CANALES', activeUser, companyId);
        await this.referenciaEnAlcance(scope.idTenant, dto.nivel, dto.idReferencia, scope);
        const previa = await this.prisma.comPerfilesCanal.findFirst({
            where: { idEmpresa: companyId, Nivel: dto.nivel, idReferencia: dto.idReferencia },
        });
        if (previa) {
            throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'Ya existe una excepción para esa referencia.');
        }
        try {
            const creada = await this.prisma.$transaction(async (tx) => {
                const fila = await tx.comPerfilesCanal.create({
                    data: {
                        idTenant: activeUser.idTenant,
                        idEmpresa: companyId,
                        Nivel: dto.nivel,
                        idReferencia: dto.idReferencia,
                        Canales: normalizarCanales(dto.canales),
                        Nota: dto.nota ?? null,
                    },
                });
                await tx.historicoMovimientos.create({
                    data: bitacora(activeUser, companyId, 'ComPerfilesCanal', fila.idPerfil, 'creó una excepción de canal.'),
                });
                return fila;
            }, TRANSACCION);
            const nombres = await this.nombres(activeUser.idTenant, dto.nivel, [dto.idReferencia]);
            return aPerfil(creada, nombres.get(dto.idReferencia) ?? '');
        } catch (error) {
            if (!esP2002(error)) throw error;
            throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'Ya existe una excepción para esa referencia.');
        }
    }

    async actualizarExcepcion(
        activeUser: ActiveUserDto,
        companyId: number,
        idPerfil: number,
        dto: ActualizarExcepcionDto,
    ): Promise<PerfilRespuesta> {
        await this.capabilities.contexto('CFG_CANALES', activeUser, companyId);
        if (dto.canales === undefined && dto.nota === undefined) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'Indica los canales o la nota que deseas cambiar.');
        }
        const actual = await this.excepcionDeEmpresa(activeUser.idTenant, companyId, idPerfil);
        const fila = await this.prisma.$transaction(async (tx) => {
            const actualizada = await tx.comPerfilesCanal.update({
                where: { idPerfil },
                data: {
                    ...(dto.canales ? { Canales: normalizarCanales(dto.canales) } : {}),
                    ...(dto.nota !== undefined ? { Nota: dto.nota } : {}),
                },
            });
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, 'ComPerfilesCanal', idPerfil, 'actualizó una excepción de canal.'),
            });
            return actualizada;
        }, TRANSACCION);
        const nombres = await this.nombres(activeUser.idTenant, actual.Nivel, [actual.idReferencia]);
        return aPerfil(fila, nombres.get(actual.idReferencia) ?? '');
    }

    async eliminarExcepcion(
        activeUser: ActiveUserDto,
        companyId: number,
        idPerfil: number,
    ): Promise<{ id: number; eliminado: boolean }> {
        await this.capabilities.contexto('CFG_CANALES', activeUser, companyId);
        await this.excepcionDeEmpresa(activeUser.idTenant, companyId, idPerfil);
        await this.prisma.$transaction(async (tx) => {
            await tx.comPerfilesCanal.delete({ where: { idPerfil } });
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, 'ComPerfilesCanal', idPerfil, 'eliminó una excepción de canal.'),
            });
        }, TRANSACCION);
        return { id: idPerfil, eliminado: true };
    }

    async canalesDeEmpleado(activeUser: ActiveUserDto, companyId: number, idEmpleado: number) {
        const scope = await this.capabilities.contexto('CFG_CANALES', activeUser, companyId);
        const existe = await this.prisma.empleados.findFirst({
            where: { idEmpleado, idTenant: activeUser.idTenant, activo: true },
            select: { idEmpleado: true },
        });
        if (!existe) {
            throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos a esa persona.');
        }
        const filas = await this.prisma.$queryRaw<{ idEmpleado: number }[]>(consultaEmpleadoEnAlcance(idEmpleado, scope));
        if (!filas.length) {
            throw errorComms(HttpStatus.FORBIDDEN, 'FUERA_DE_ALCANCE', 'Esa persona está fuera de tu alcance.', {
                ids: [idEmpleado],
            });
        }
        const resultado = await this.efectivos.forEmployees([idEmpleado], companyId);
        return resultado.porEmpleado[0];
    }

    private async asegurarConfig(idTenant: number, companyId: number) {
        return this.prisma.comConfigEmpresa.upsert({
            where: { idEmpresa: companyId },
            update: { idTenant },
            create: { idEmpresa: companyId, idTenant },
        });
    }

    private async excepcionDeEmpresa(idTenant: number, companyId: number, idPerfil: number) {
        const fila = await this.prisma.comPerfilesCanal.findFirst({
            where: {
                idPerfil,
                idEmpresa: companyId,
                idTenant,
                Nivel: { in: ['EMPLEADO', 'UBICACION'] },
            },
        });
        if (!fila || (fila.Nivel !== 'EMPLEADO' && fila.Nivel !== 'UBICACION')) {
            throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos esa excepción.');
        }
        return fila;
    }

    private async referenciaEnAlcance(
        idTenant: number,
        nivel: 'EMPLEADO' | 'UBICACION',
        idReferencia: number,
        scope: Awaited<ReturnType<CommsCapabilityService['contexto']>>,
    ): Promise<void> {
        if (nivel === 'EMPLEADO') {
            const existe = await this.prisma.empleados.findFirst({
                where: { idEmpleado: idReferencia, idTenant, activo: true },
                select: { idEmpleado: true },
            });
            if (!existe) {
                throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos a esa persona.');
            }
            const filas = await this.prisma.$queryRaw<{ idEmpleado: number }[]>(
                consultaEmpleadoEnAlcance(idReferencia, scope),
            );
            if (!filas.length) {
                throw errorComms(HttpStatus.FORBIDDEN, 'FUERA_DE_ALCANCE', 'Esa persona está fuera de tu alcance.', {
                    ids: [idReferencia],
                });
            }
            return;
        }
        const site = await this.prisma.catSites.findFirst({
            where: { idSite: idReferencia, idTenant },
            select: { idSite: true, idEmpresa: true },
        });
        if (!site) {
            throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos esa ubicación.');
        }
        const permitidas = empresasPermitidas(scope);
        const empresaOk = !permitidas || (site.idEmpresa != null && permitidas.has(site.idEmpresa));
        const siteOk = scope.alcance !== 'UBICACIONES' || scope.sitesUsuario.includes(site.idSite);
        if (!empresaOk || !siteOk) {
            throw errorComms(HttpStatus.FORBIDDEN, 'FUERA_DE_ALCANCE', 'Esa ubicación está fuera de tu alcance.', {
                ids: [idReferencia],
            });
        }
    }

    private async nombres(
        idTenant: number,
        nivel: 'EMPLEADO' | 'UBICACION' | 'TIPO_PERSONAL',
        ids: number[],
    ): Promise<Map<number, string>> {
        if (!ids.length) return new Map();
        if (nivel === 'EMPLEADO') {
            const filas = await this.prisma.empleados.findMany({
                where: { idTenant, idEmpleado: { in: ids } },
                select: { idEmpleado: true, nombre: true, primerApellido: true, segundoApellido: true },
            });
            return new Map(
                filas.map((fila) => [
                    fila.idEmpleado,
                    [fila.nombre, fila.primerApellido, fila.segundoApellido].filter(Boolean).join(' '),
                ]),
            );
        }
        if (nivel === 'UBICACION') {
            const filas = await this.prisma.catSites.findMany({
                where: { idTenant, idSite: { in: ids } },
                select: { idSite: true, Descripcion: true },
            });
            return new Map(filas.map((fila) => [fila.idSite, fila.Descripcion ?? '']));
        }
        const filas = await this.prisma.catTiposPersonal.findMany({
            where: { idTenant, idTipoPersonal: { in: ids } },
            select: { idTipoPersonal: true, Nombre: true },
        });
        return new Map(filas.map((fila) => [fila.idTipoPersonal, fila.Nombre]));
    }
}

function aConfig(fila: {
    PoliticaWhatsApp: string;
    EscalaImportanteMin: number;
    EscalaCriticaMin: number;
    EscalaCorreoMin: number;
    SilencioActivo: boolean;
    SilencioInicio: string;
    SilencioFin: string;
    LimiteDiarioRecordatorios: number;
    JefesAvisoEquipo: boolean;
    PlantillasWhatsApp: unknown;
}): ConfigCanales {
    return {
        politicaWhatsApp: fila.PoliticaWhatsApp || POLITICA_WHATSAPP_DEFAULT,
        escalaImportanteMin: fila.EscalaImportanteMin,
        escalaCriticaMin: fila.EscalaCriticaMin,
        escalaCorreoMin: fila.EscalaCorreoMin,
        silencioActivo: fila.SilencioActivo,
        silencioInicio: fila.SilencioInicio,
        silencioFin: fila.SilencioFin,
        limiteDiarioRecordatorios: fila.LimiteDiarioRecordatorios,
        jefesAvisoEquipo: fila.JefesAvisoEquipo,
        plantillasWhatsApp: fila.PlantillasWhatsApp ?? null,
    };
}

function datosConfig(dto: ActualizarChannelConfigDto): Prisma.ComConfigEmpresaUpdateInput {
    const data: Prisma.ComConfigEmpresaUpdateInput = {};
    if (dto.politicaWhatsApp !== undefined) data.PoliticaWhatsApp = dto.politicaWhatsApp;
    if (dto.escalaImportanteMin !== undefined) data.EscalaImportanteMin = dto.escalaImportanteMin;
    if (dto.escalaCriticaMin !== undefined) data.EscalaCriticaMin = dto.escalaCriticaMin;
    if (dto.escalaCorreoMin !== undefined) data.EscalaCorreoMin = dto.escalaCorreoMin;
    if (dto.silencioActivo !== undefined) data.SilencioActivo = dto.silencioActivo;
    if (dto.silencioInicio !== undefined) data.SilencioInicio = dto.silencioInicio;
    if (dto.silencioFin !== undefined) data.SilencioFin = dto.silencioFin;
    if (dto.limiteDiarioRecordatorios !== undefined) data.LimiteDiarioRecordatorios = dto.limiteDiarioRecordatorios;
    if (dto.jefesAvisoEquipo !== undefined) data.JefesAvisoEquipo = dto.jefesAvisoEquipo;
    if (dto.plantillasWhatsApp !== undefined) {
        data.PlantillasWhatsApp =
            dto.plantillasWhatsApp === null ? Prisma.JsonNull : (dto.plantillasWhatsApp as Prisma.InputJsonValue);
    }
    return data;
}

function aPerfil(
    fila: { idPerfil: number; Nivel: string; idReferencia: number; Canales: unknown; Nota: string | null },
    nombre: string,
): PerfilRespuesta {
    const nivel = fila.Nivel === 'EMPLEADO' || fila.Nivel === 'UBICACION' || fila.Nivel === 'TIPO_PERSONAL' ? fila.Nivel : 'TIPO_PERSONAL';
    return {
        id: fila.idPerfil,
        nivel,
        idReferencia: fila.idReferencia,
        nombre,
        canales: normalizarCanales(fila.Canales),
        nota: fila.Nota,
    };
}

function bitacora(activeUser: ActiveUserDto, companyId: number, tabla: string, id: number, verbo: string) {
    return {
        idUsuario: activeUser.id,
        idEmpresa: companyId,
        accion: 'ACTUALIZAR',
        tablaOrigen: tabla,
        idRegistro: String(id),
        descripcion: `${activeUser.first_name} ${activeUser.last_name} ${verbo}`,
        fechaCreacion: new Date(),
    };
}
