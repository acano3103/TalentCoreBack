import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { errorComms } from '../comms-http';
import { CommsCapabilityService } from '../capabilities/comms-capability.service';
import { EffectiveChannelService } from '../channels/effective-channel.service';
import { AudienceOptionsService, OpcionesAudiencia } from './audience-options.service';
import { AudiencePreviewStore } from './audience-preview.store';
import { AudienceResolverService } from './audience-resolver.service';
import { CriteriosAudiencia, normalizarCriterios, ResultadoAudiencia } from './criterios';
import { GuardarAudienciaDto } from './dto/guardar-audiencia.dto';
import { ActualizarAudienciaDto } from './dto/actualizar-audiencia.dto';
import { WhatsAppCapService } from '../whatsapp-usage/whatsapp-cap.service';
import { EstadoTope } from '../whatsapp-usage/periodo';

const TRANSACCION = { maxWait: 15_000, timeout: 60_000 };
const MUESTRA = 20;
const PAGINA = 20;

export interface PersonaAudiencia {
    idEmpleado: number;
    nombre: string;
    numeroEmpleado: string | null;
    canales: string[];
    sinCanal: boolean;
}

export interface VistaPrevia {
    total: number;
    porCanal: {
        APP: number;
        WHATSAPP: number;
        CORREO: number;
        KIOSCO: number;
        SIN_CANAL: number;
    };
    costoWhatsAppEstimado: string | null;
    topeWhatsApp: EstadoTope | null;
    muestra: PersonaAudiencia[];
    fueraDeAlcance: number[];
    previewId: string;
}

export interface PaginaDestinatarios {
    total: number;
    page: number;
    pageSize: number;
    items: PersonaAudiencia[];
}

export interface AudienciaGuardada {
    id: number;
    nombre: string;
    tipo: 'DINAMICA' | 'FIJA';
    criterios: CriteriosAudiencia;
    totalPersonas: number | null;
    activo: boolean;
    fechaRegistro: Date;
}

interface FilaEmpleado {
    idEmpleado: number;
    nombre: string | null;
    primerApellido: string | null;
    segundoApellido: string | null;
    numeroEmpleado: string | null;
}

@Injectable()
export class AudiencesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly capabilities: CommsCapabilityService,
        private readonly resolver: AudienceResolverService,
        private readonly canales: EffectiveChannelService,
        private readonly previews: AudiencePreviewStore,
        private readonly catalogoOpciones: AudienceOptionsService,
        @Optional() @Inject(WhatsAppCapService) private readonly caps?: WhatsAppCapService,
    ) {}

    async preview(activeUser: ActiveUserDto, companyId: number, criterios: CriteriosAudiencia): Promise<VistaPrevia> {
        const scope = await this.capabilities.contexto('COM_CREAR', activeUser, companyId);
        const resultado = await this.resolver.resolve(criterios, scope);
        this.asegurar(resultado, 'preview');
        const canales = await this.canales.forEmployees(resultado.ids, companyId);
        const precio = await this.precioVigente(activeUser.idTenant);
        const muestraIds = resultado.ids.slice(0, MUESTRA);
        const nombres = await this.nombres(muestraIds);
        const previewId = randomUUID();
        await this.previews.guardar(previewId, {
            idTenant: activeUser.idTenant,
            companyId,
            idUsuario: activeUser.id,
            ids: resultado.ids,
        });
        return {
            total: resultado.ids.length,
            porCanal: canales.resumen,
            costoWhatsAppEstimado: precio ? multiplicarPrecio(precio, canales.resumen.WHATSAPP) : null,
            topeWhatsApp: this.caps ? await this.caps.estado(activeUser.idTenant, companyId, 'NORMAL') : null,
            muestra: canales.porEmpleado.slice(0, MUESTRA).map((fila) => aPersona(fila, nombres.get(fila.idEmpleado))),
            fueraDeAlcance: resultado.fueraDeAlcance,
            previewId,
        };
    }

    async destinatarios(
        activeUser: ActiveUserDto,
        companyId: number,
        previewId: string,
        page = 1,
        pageSize = PAGINA,
        search?: string,
    ): Promise<PaginaDestinatarios> {
        const guardado = await this.previews.leer(previewId);
        if (
            !guardado ||
            guardado.idTenant !== activeUser.idTenant ||
            guardado.companyId !== companyId ||
            guardado.idUsuario !== activeUser.id
        ) {
            throw errorComms(
                HttpStatus.NOT_FOUND,
                'NO_ENCONTRADO',
                'La vista previa venció o no existe. Calcula la audiencia otra vez.',
            );
        }
        const termino = search?.trim();
        const universo = termino ? await this.filtrar(guardado.ids, activeUser.idTenant, termino) : guardado.ids;
        const inicio = (page - 1) * pageSize;
        const pagina = universo.slice(inicio, inicio + pageSize);
        const [nombres, canales] = await Promise.all([
            this.nombres(pagina),
            this.canales.forEmployees(pagina, companyId),
        ]);
        return {
            total: termino ? universo.length : guardado.ids.length,
            page,
            pageSize,
            items: canales.porEmpleado.map((fila) => aPersona(fila, nombres.get(fila.idEmpleado))),
        };
    }

    async opciones(activeUser: ActiveUserDto, companyId: number): Promise<OpcionesAudiencia> {
        const scope = await this.capabilities.contexto('COM_CREAR', activeUser, companyId);
        return this.catalogoOpciones.listar(scope);
    }

    async listar(activeUser: ActiveUserDto, companyId: number): Promise<AudienciaGuardada[]> {
        await this.capabilities.contexto('COM_CREAR', activeUser, companyId);
        const filas = await this.prisma.comAudiencias.findMany({
            where: { idTenant: activeUser.idTenant, idEmpresa: companyId, Activo: true },
            orderBy: { FechaRegistro: 'desc' },
            include: { _count: { select: { ComAudienciaPersonas: true } } },
        });
        return filas.map((fila) => aAudiencia(fila, fila._count.ComAudienciaPersonas));
    }

    async detalle(activeUser: ActiveUserDto, companyId: number, idAudiencia: number): Promise<AudienciaGuardada> {
        await this.capabilities.contexto('COM_CREAR', activeUser, companyId);
        const fila = await this.buscar(activeUser.idTenant, companyId, idAudiencia);
        const total = await this.prisma.comAudienciaPersonas.count({ where: { idAudiencia } });
        return aAudiencia(fila, total);
    }

    async crear(activeUser: ActiveUserDto, companyId: number, dto: GuardarAudienciaDto): Promise<AudienciaGuardada> {
        const scope = await this.capabilities.contexto('AUD_GESTIONAR', activeUser, companyId);
        const criterios = normalizarCriterios(dto.criterios);
        const resultado = await this.resolver.resolve(criterios, scope);
        this.asegurar(resultado, 'guardar');
        const creada = await this.prisma.$transaction(async (tx) => {
            const audiencia = await tx.comAudiencias.create({
                data: {
                    idTenant: activeUser.idTenant,
                    idEmpresa: companyId,
                    Nombre: dto.nombre,
                    Tipo: dto.tipo,
                    Criterios: jsonCriterios(criterios),
                    CreadoPor: activeUser.uuid,
                },
            });
            if (dto.tipo === 'FIJA') await guardarPersonas(tx, audiencia.idAudiencia, resultado.ids);
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, 'CREAR', audiencia.idAudiencia, `creó la audiencia ${dto.nombre}.`),
            });
            return audiencia;
        }, TRANSACCION);
        const total = dto.tipo === 'FIJA' ? resultado.ids.length : null;
        return aAudiencia(creada, total ?? 0);
    }

    async actualizar(
        activeUser: ActiveUserDto,
        companyId: number,
        idAudiencia: number,
        dto: ActualizarAudienciaDto,
    ): Promise<AudienciaGuardada> {
        if (dto.nombre === undefined && dto.tipo === undefined && dto.criterios === undefined) {
            throw errorComms(
                HttpStatus.BAD_REQUEST,
                'CONTENIDO_INVALIDO',
                'Indica el nombre, el tipo o los criterios que deseas cambiar.',
            );
        }
        const scope = await this.capabilities.contexto('AUD_GESTIONAR', activeUser, companyId);
        const actual = await this.buscar(activeUser.idTenant, companyId, idAudiencia);
        const tipo = dto.tipo ?? (actual.Tipo === 'FIJA' ? 'FIJA' : 'DINAMICA');
        const criterios = dto.criterios ? normalizarCriterios(dto.criterios) : leerCriterios(actual.Criterios);
        let ids: number[] | null = null;
        if (dto.criterios || dto.tipo) {
            const resultado = await this.resolver.resolve(criterios, scope);
            this.asegurar(resultado, 'guardar');
            ids = resultado.ids;
        }
        const guardada = await this.prisma.$transaction(async (tx) => {
            const audiencia = await tx.comAudiencias.update({
                where: { idAudiencia },
                data: {
                    Nombre: dto.nombre ?? actual.Nombre,
                    Tipo: tipo,
                    Criterios: jsonCriterios(criterios),
                    FechaActualizacion: new Date(),
                },
            });
            if (ids) {
                await tx.comAudienciaPersonas.deleteMany({ where: { idAudiencia } });
                if (tipo === 'FIJA') await guardarPersonas(tx, idAudiencia, ids);
            }
            await tx.historicoMovimientos.create({
                data: bitacora(
                    activeUser,
                    companyId,
                    'ACTUALIZAR',
                    idAudiencia,
                    `actualizó la audiencia ${audiencia.Nombre}.`,
                ),
            });
            return audiencia;
        }, TRANSACCION);
        const total = tipo === 'FIJA' ? (ids?.length ?? (await this.prisma.comAudienciaPersonas.count({ where: { idAudiencia } }))) : 0;
        return aAudiencia(guardada, total);
    }

    async archivar(activeUser: ActiveUserDto, companyId: number, idAudiencia: number): Promise<{ id: number; activo: boolean }> {
        await this.capabilities.contexto('AUD_GESTIONAR', activeUser, companyId);
        const actual = await this.buscar(activeUser.idTenant, companyId, idAudiencia);
        await this.prisma.$transaction(async (tx) => {
            await tx.comAudiencias.update({
                where: { idAudiencia },
                data: { Activo: false, FechaActualizacion: new Date() },
            });
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, 'DESACTIVAR', idAudiencia, `archivó la audiencia ${actual.Nombre}.`),
            });
        }, TRANSACCION);
        return { id: idAudiencia, activo: false };
    }

    private asegurar(resultado: ResultadoAudiencia, modo: 'preview' | 'guardar'): void {
        if (resultado.fueraDeAlcance.length > 0 && (modo === 'guardar' || resultado.ids.length === 0)) {
            throw errorComms(
                HttpStatus.FORBIDDEN,
                'FUERA_DE_ALCANCE',
                'La audiencia incluye personas o filtros fuera de tu alcance.',
                { ids: resultado.fueraDeAlcance },
            );
        }
        if (!resultado.ids.length) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'AUDIENCIA_VACIA', 'La audiencia no incluye a ninguna persona.');
        }
    }

    private async buscar(idTenant: number, companyId: number, idAudiencia: number) {
        const fila = await this.prisma.comAudiencias.findFirst({
            where: { idAudiencia, idTenant, idEmpresa: companyId, Activo: true },
        });
        if (!fila) {
            throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos esa audiencia.');
        }
        return fila;
    }

    private async filtrar(ids: number[], idTenant: number, termino: string): Promise<number[]> {
        if (!ids.length) return [];
        const patron = `%${termino.replace(/[\\%_]/g, (caracter) => `\\${caracter}`)}%`;
        const coinciden = new Set<number>();
        for (let inicio = 0; inicio < ids.length; inicio += 2000) {
            const lote = ids.slice(inicio, inicio + 2000);
            const filas = await this.prisma.$queryRaw<{ idEmpleado: number }[]>(Prisma.sql`
                SELECT e.idEmpleado AS idEmpleado
                FROM Empleados e
                WHERE e.idTenant = ${idTenant}
                  AND e.idEmpleado IN (${Prisma.join(lote)})
                  AND (
                    e.nombre LIKE ${patron}
                    OR e.primerApellido LIKE ${patron}
                    OR e.segundoApellido LIKE ${patron}
                    OR e.numeroEmpleado LIKE ${patron}
                    OR CONCAT_WS(' ', e.nombre, e.primerApellido, e.segundoApellido) LIKE ${patron}
                  )
            `);
            for (const fila of filas) coinciden.add(Number(fila.idEmpleado));
        }
        return ids.filter((id) => coinciden.has(id));
    }

    private async nombres(ids: number[]): Promise<Map<number, FilaEmpleado>> {
        if (!ids.length) return new Map();
        const filas = await this.prisma.empleados.findMany({
            where: { idEmpleado: { in: ids } },
            select: {
                idEmpleado: true,
                nombre: true,
                primerApellido: true,
                segundoApellido: true,
                numeroEmpleado: true,
            },
        });
        return new Map(filas.map((fila) => [fila.idEmpleado, fila]));
    }

    private async precioVigente(idTenant: number): Promise<string | null> {
        const propio = await this.prisma.waPrecios.findFirst({
            where: { idTenant, VigenteDesde: { lte: new Date() } },
            orderBy: { VigenteDesde: 'desc' },
        });
        const fila =
            propio ??
            (await this.prisma.waPrecios.findFirst({
                where: { idTenant: null, VigenteDesde: { lte: new Date() } },
                orderBy: { VigenteDesde: 'desc' },
            }));
        return fila ? fila.PrecioBase.toString() : null;
    }
}

async function guardarPersonas(
    tx: Prisma.TransactionClient,
    idAudiencia: number,
    ids: number[],
): Promise<void> {
    for (let inicio = 0; inicio < ids.length; inicio += 1000) {
        await tx.comAudienciaPersonas.createMany({
            data: ids.slice(inicio, inicio + 1000).map((idEmpleado) => ({ idAudiencia, idEmpleado })),
        });
    }
}

function aPersona(
    fila: { idEmpleado: number; canales: string[]; sinCanal: boolean },
    empleado: FilaEmpleado | undefined,
): PersonaAudiencia {
    return {
        idEmpleado: fila.idEmpleado,
        nombre: empleado ? nombreCompleto(empleado) : '',
        numeroEmpleado: empleado?.numeroEmpleado ?? null,
        canales: fila.canales,
        sinCanal: fila.sinCanal,
    };
}

function nombreCompleto(fila: FilaEmpleado): string {
    return [fila.nombre, fila.primerApellido, fila.segundoApellido]
        .filter((parte): parte is string => typeof parte === 'string' && parte.trim().length > 0)
        .join(' ');
}

function aAudiencia(
    fila: {
        idAudiencia: number;
        Nombre: string;
        Tipo: string;
        Criterios: unknown;
        Activo: boolean;
        FechaRegistro: Date;
    },
    personas: number,
): AudienciaGuardada {
    const tipo = fila.Tipo === 'FIJA' ? 'FIJA' : 'DINAMICA';
    return {
        id: fila.idAudiencia,
        nombre: fila.Nombre,
        tipo,
        criterios: leerCriterios(fila.Criterios),
        totalPersonas: tipo === 'FIJA' ? personas : null,
        activo: fila.Activo,
        fechaRegistro: fila.FechaRegistro,
    };
}

function leerCriterios(valor: unknown): CriteriosAudiencia {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
    return normalizarCriterios(valor as CriteriosAudiencia);
}

function jsonCriterios(criterios: CriteriosAudiencia): Prisma.InputJsonValue {
    const limpio: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(criterios)) {
        if (Array.isArray(valor) && valor.length) limpio[clave] = valor;
    }
    return limpio as Prisma.InputJsonValue;
}

function bitacora(activeUser: ActiveUserDto, companyId: number, accion: string, id: number, verbo: string) {
    return {
        idUsuario: activeUser.id,
        idEmpresa: companyId,
        accion,
        tablaOrigen: 'ComAudiencias',
        idRegistro: String(id),
        descripcion: `${activeUser.first_name} ${activeUser.last_name} ${verbo}`,
        fechaCreacion: new Date(),
    };
}

function multiplicarPrecio(precio: string, cantidad: number): string {
    const negativo = precio.trim().startsWith('-');
    const limpio = precio.trim().replace('-', '');
    const [entero, fraccion = ''] = limpio.split('.');
    const fraccion4 = `${fraccion}0000`.slice(0, 4);
    const base = BigInt(`${entero || '0'}${fraccion4}`);
    const total = base * BigInt(cantidad);
    const digitos = total.toString().padStart(5, '0');
    const corte = digitos.length - 4;
    const cuerpo = `${digitos.slice(0, corte)}.${digitos.slice(corte)}`;
    return negativo ? `-${cuerpo}` : cuerpo;
}
