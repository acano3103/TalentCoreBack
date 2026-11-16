import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { CommsCapabilityService } from '../capabilities/comms-capability.service';
import { normalizarCanales } from '../channels/canales';
import { errorComms, esP2002 } from '../comms-http';
import { ActualizarReglaDto } from './dto/actualizar-regla.dto';
import { HistorialRecordatoriosQuery } from './dto/historial-recordatorios.query';
import {
    esCodigoRegla,
    ordenRegla,
    REGLAS_DEFAULT,
    reglaDefault,
    validarCanales,
    validarIds,
    validarParametros,
} from './reglas-default';

const TRANSACCION = { maxWait: 15_000, timeout: 20_000 };
const PAGINA = 50;

export interface ReglaRespuesta {
    codigo: string;
    nombre: string;
    activo: boolean;
    parametros: Record<string, unknown>;
    canales: string[];
    plantilla: string;
    aplicaTiposPersonal: number[] | null;
    excluyeSites: number[] | null;
}

@Injectable()
export class ReminderRulesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly capabilities: CommsCapabilityService,
    ) {}

    async listar(activeUser: ActiveUserDto, companyId: number): Promise<{ reglas: ReglaRespuesta[] }> {
        await this.capabilities.contexto('CFG_RECORDATORIOS', activeUser, companyId);
        const filas = await this.asegurar(activeUser.idTenant, companyId);
        return { reglas: filas.map(aRegla).sort((a, b) => ordenRegla(a.codigo) - ordenRegla(b.codigo)) };
    }

    async actualizar(activeUser: ActiveUserDto, companyId: number, codigoCrudo: string, dto: ActualizarReglaDto): Promise<ReglaRespuesta> {
        await this.capabilities.contexto('CFG_RECORDATORIOS', activeUser, companyId);
        const codigo = normalizarCodigo(codigoCrudo);
        if (!hayCambio(dto)) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'Indica al menos un cambio de la regla.');
        }
        const data = datos(codigo, dto);
        await this.asegurar(activeUser.idTenant, companyId);
        const fila = await this.prisma.$transaction(async (tx) => {
            const actual = await tx.comReglasRecordatorio.findUnique({
                where: { idEmpresa_Codigo: { idEmpresa: companyId, Codigo: codigo } },
            });
            if (!actual || actual.idTenant !== activeUser.idTenant) {
                throw errorComms(HttpStatus.CONFLICT, 'ESTADO_INVALIDO', 'No encontramos esa regla en la empresa.');
            }
            const actualizada = await tx.comReglasRecordatorio.update({
                where: { idRegla: actual.idRegla },
                data,
            });
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, actual.idRegla, `actualizó la regla ${codigo}.`),
            });
            return actualizada;
        }, TRANSACCION);
        return aRegla(fila);
    }

    async restablecer(activeUser: ActiveUserDto, companyId: number, codigoCrudo: string): Promise<ReglaRespuesta> {
        await this.capabilities.contexto('CFG_RECORDATORIOS', activeUser, companyId);
        const codigo = normalizarCodigo(codigoCrudo);
        const base = reglaDefault(codigo);
        if (!base) throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'Esa regla de recordatorio no existe.');
        await this.asegurar(activeUser.idTenant, companyId);
        const fila = await this.prisma.$transaction(async (tx) => {
            const actualizada = await tx.comReglasRecordatorio.update({
                where: { idEmpresa_Codigo: { idEmpresa: companyId, Codigo: codigo } },
                data: {
                    Activo: base.activo,
                    Parametros: base.parametros as Prisma.InputJsonValue,
                    Canales: base.canales,
                    Plantilla: base.plantilla,
                    AplicaTiposPersonal: Prisma.DbNull,
                    ExcluyeSites: Prisma.DbNull,
                },
            });
            await tx.historicoMovimientos.create({
                data: bitacora(activeUser, companyId, actualizada.idRegla, `restableció la regla ${codigo}.`),
            });
            return actualizada;
        }, TRANSACCION);
        return aRegla(fila);
    }

    async historial(activeUser: ActiveUserDto, companyId: number, query: HistorialRecordatoriosQuery) {
        await this.capabilities.contexto('CFG_RECORDATORIOS', activeUser, companyId);
        const page = query.page ?? 1;
        const where = {
            idEmpresa: companyId,
            ...(query.codigo ? { Codigo: query.codigo.toUpperCase() } : {}),
            ...(query.idEmpleado ? { idEmpleado: query.idEmpleado } : {}),
        };
        const [total, filas] = await Promise.all([
            this.prisma.comRecordatoriosEnviados.count({ where }),
            this.prisma.comRecordatoriosEnviados.findMany({
                where,
                orderBy: { EnviadoEn: 'desc' },
                skip: (page - 1) * PAGINA,
                take: PAGINA,
            }),
        ]);
        return {
            page,
            total,
            historial: filas.map((fila) => ({
                id: fila.id.toString(),
                codigo: fila.Codigo,
                idEmpleado: fila.idEmpleado,
                referencia: fila.Referencia,
                intento: fila.Intento,
                enviadoEn: fila.EnviadoEn,
            })),
        };
    }

    private async asegurar(idTenant: number, idEmpresa: number) {
        const existentes = await this.prisma.comReglasRecordatorio.findMany({ where: { idEmpresa, idTenant } });
        const tienen = new Set(existentes.map((fila) => fila.Codigo));
        const faltantes = REGLAS_DEFAULT.filter((regla) => !tienen.has(regla.codigo));
        if (faltantes.length) {
            try {
                await this.prisma.comReglasRecordatorio.createMany({
                    data: faltantes.map((regla) => ({
                        idTenant,
                        idEmpresa,
                        Codigo: regla.codigo,
                        Activo: regla.activo,
                        Parametros: regla.parametros as Prisma.InputJsonValue,
                        Canales: regla.canales,
                        Plantilla: regla.plantilla,
                    })),
                    skipDuplicates: true,
                });
            } catch (error) {
                if (!esP2002(error)) throw error;
            }
        }
        return this.prisma.comReglasRecordatorio.findMany({ where: { idEmpresa, idTenant } });
    }
}

function normalizarCodigo(codigo: string): string {
    const limpio = codigo.trim().toUpperCase();
    if (!esCodigoRegla(limpio)) {
        throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'Esa regla de recordatorio no existe.');
    }
    return limpio;
}

function hayCambio(dto: ActualizarReglaDto): boolean {
    return dto.activo !== undefined
        || dto.parametros !== undefined
        || dto.canales !== undefined
        || dto.plantilla !== undefined
        || dto.aplicaTiposPersonal !== undefined
        || dto.excluyeSites !== undefined;
}

function datos(codigo: string, dto: ActualizarReglaDto): Prisma.ComReglasRecordatorioUpdateInput {
    const data: Prisma.ComReglasRecordatorioUpdateInput = {};
    if (dto.activo !== undefined) data.Activo = dto.activo;
    if (dto.parametros !== undefined) {
        const validos = validarParametros(codigo, dto.parametros);
        if (!validos.ok) throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', validos.message);
        data.Parametros = validos.parametros as Prisma.InputJsonValue;
    }
    if (dto.canales !== undefined) {
        const canales = validarCanales(dto.canales);
        if (!canales) throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'Elige al menos un canal válido.');
        data.Canales = canales;
    }
    if (dto.plantilla !== undefined) {
        const plantilla = dto.plantilla.trim();
        if (!plantilla || plantilla.length > 500) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'La plantilla debe tener entre 1 y 500 caracteres.');
        }
        data.Plantilla = plantilla;
    }
    if (dto.aplicaTiposPersonal !== undefined) {
        if (dto.aplicaTiposPersonal === null) data.AplicaTiposPersonal = Prisma.DbNull;
        else {
            const ids = validarIds(dto.aplicaTiposPersonal);
            if (!ids) throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'Los tipos de personal no son válidos.');
            data.AplicaTiposPersonal = ids;
        }
    }
    if (dto.excluyeSites !== undefined) {
        if (dto.excluyeSites === null) data.ExcluyeSites = Prisma.DbNull;
        else {
            const ids = validarIds(dto.excluyeSites);
            if (!ids) throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'Las ubicaciones no son válidas.');
            data.ExcluyeSites = ids;
        }
    }
    return data;
}

function aRegla(fila: {
    Codigo: string;
    Activo: boolean;
    Parametros: unknown;
    Canales: unknown;
    Plantilla: string;
    AplicaTiposPersonal: unknown;
    ExcluyeSites: unknown;
}): ReglaRespuesta {
    const catalogo = reglaDefault(fila.Codigo);
    const parametros = fila.Parametros && typeof fila.Parametros === 'object' && !Array.isArray(fila.Parametros)
        ? (fila.Parametros as Record<string, unknown>)
        : {};
    return {
        codigo: fila.Codigo,
        nombre: catalogo?.nombre ?? fila.Codigo,
        activo: fila.Activo,
        parametros,
        canales: normalizarCanales(fila.Canales),
        plantilla: fila.Plantilla,
        aplicaTiposPersonal: idsONull(fila.AplicaTiposPersonal),
        excluyeSites: idsONull(fila.ExcluyeSites),
    };
}

function idsONull(valor: unknown): number[] | null {
    if (valor == null) return null;
    const ids = validarIds(valor);
    return ids?.length ? ids : null;
}

function bitacora(activeUser: ActiveUserDto, companyId: number, id: number, verbo: string) {
    return {
        idUsuario: activeUser.id,
        idEmpresa: companyId,
        accion: 'ACTUALIZAR',
        tablaOrigen: 'ComReglasRecordatorio',
        idRegistro: String(id),
        descripcion: `${activeUser.first_name} ${activeUser.last_name} ${verbo}`,
        fechaCreacion: new Date(),
    };
}
