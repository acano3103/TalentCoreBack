import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ExcelColumn } from 'src/common/services/excel-export.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CapacidadEfectiva } from '../capabilities/alcance';
import { CommsCapabilityService } from '../capabilities/comms-capability.service';
import { errorComms } from '../comms-http';
import { ActualizarTopeDto } from './dto/whatsapp-usage.query';
import { WhatsAppCapService } from './whatsapp-cap.service';
import {
    EstadoTope,
    aNumero,
    evaluarTope,
    mesActual,
    mesValido,
    mesesAtras,
    rangoMes,
    redondear,
    resumirConsumo,
} from './periodo';

const TRANSACCION = { maxWait: 15_000, timeout: 20_000 };

interface AlcanceUso {
    empresas: number[] | null;
    puedeTopeTenant: boolean;
}

interface FilaGrupo {
    idTenant: number;
    idEmpresa: number;
    categoria: string;
    mensajes: number;
    costo: number;
}

export interface ResumenUso {
    mes: string;
    mensajes: number;
    costo: number;
    moneda: string;
    precioVigente: number | null;
    porCategoria: { categoria: string; mensajes: number; costo: number }[];
    tope: EstadoTope | null;
}

@Injectable()
export class WhatsappUsageService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly capabilities: CommsCapabilityService,
        private readonly caps: WhatsAppCapService,
    ) {}

    async resumen(activeUser: ActiveUserDto, companyId: number, query: { mes?: string; empresa?: number; categoria?: string }): Promise<ResumenUso> {
        const alcance = await this.alcance(activeUser, companyId);
        const mes = this.mes(query.mes);
        const ids = await this.empresasDeConsulta(activeUser.idTenant, alcance, query.empresa);
        const filas = await this.grupos(activeUser.idTenant, mes, ids, query.categoria?.trim().toUpperCase());
        const totales = resumirConsumo(filas, activeUser.idTenant);
        const ahora = new Date();
        const precio = await this.caps.precioActual(activeUser.idTenant, this.corte(mes, ahora), 'NORMAL');
        const empresaTope = query.empresa ?? (ids && ids.length === 1 ? ids[0] : null);
        const tope = await this.topeAplicable(activeUser.idTenant, empresaTope, totales.costo);
        return {
            mes,
            mensajes: totales.mensajes,
            costo: totales.costo,
            moneda: precio?.moneda ?? 'MXN',
            precioVigente: precio?.precio ?? null,
            porCategoria: totales.porCategoria,
            tope,
        };
    }

    async mensual(activeUser: ActiveUserDto, companyId: number, meses = 6) {
        const alcance = await this.alcance(activeUser, companyId);
        const cantidad = Math.min(24, Math.max(1, meses || 6));
        const lista = mesesAtras(new Date(), cantidad);
        const ids = await this.empresasDeConsulta(activeUser.idTenant, alcance);
        const inicio = rangoMes(lista[0]).inicio;
        const fin = rangoMes(lista[lista.length - 1]).fin;
        const filas = ids && !ids.length
            ? []
            : await this.prisma.$queryRaw<{ mes: string; mensajes: unknown; costo: unknown }[]>(Prisma.sql`
                SELECT DATE_FORMAT(\`EnviadoEn\`, '%Y-%m') AS mes,
                       COUNT(*) AS mensajes,
                       COALESCE(SUM(\`Costo\`), 0) AS costo
                FROM \`WaConsumo\`
                WHERE \`idTenant\` = ${activeUser.idTenant}
                  AND \`Estatus\` <> 'FALLIDO'
                  AND \`EnviadoEn\` >= ${inicio}
                  AND \`EnviadoEn\` < ${fin}
                  ${ids ? Prisma.sql`AND \`idEmpresa\` IN (${Prisma.join(ids)})` : Prisma.empty}
                GROUP BY mes
            `);
        const mapa = new Map(
            filas.map((fila) => [String(fila.mes), { mensajes: aNumero(fila.mensajes), costo: redondear(aNumero(fila.costo), 4) }]),
        );
        return {
            meses: lista.map((mes) => ({
                mes,
                mensajes: mapa.get(mes)?.mensajes ?? 0,
                costo: mapa.get(mes)?.costo ?? 0,
            })),
        };
    }

    async desglose(activeUser: ActiveUserDto, companyId: number, mesTexto?: string) {
        const alcance = await this.alcance(activeUser, companyId);
        const mes = this.mes(mesTexto);
        const ids = await this.empresasDeConsulta(activeUser.idTenant, alcance);
        const filas = await this.grupos(activeUser.idTenant, mes, ids);
        const empresas = await this.nombres(activeUser.idTenant, ids);
        const topes = await this.prisma.waTopes.findMany({
            where: { idTenant: activeUser.idTenant, Activo: true },
            orderBy: { id: 'desc' },
        });
        const items = empresas.map((empresa) => {
            const propias = resumirConsumo(
                filas.filter((fila) => fila.idEmpresa === empresa.idEmpresa),
                activeUser.idTenant,
            );
            const tope = topes.find((fila) => fila.idEmpresa === empresa.idEmpresa) ?? topes.find((fila) => fila.idEmpresa == null);
            return {
                idEmpresa: empresa.idEmpresa,
                nombre: empresa.nombre_comercial,
                mensajes: propias.mensajes,
                costo: propias.costo,
                porCategoria: propias.porCategoria,
                tope: evaluarTope({
                    consumo: propias.costo,
                    tope: tope ? aNumero(tope.TopeMensual) : null,
                    accion: tope?.Accion ?? null,
                    prioridad: 'NORMAL',
                }),
            };
        });
        return { mes, empresas: items };
    }

    async filasExport(activeUser: ActiveUserDto, companyId: number, mesTexto?: string) {
        const alcance = await this.alcance(activeUser, companyId);
        const mes = this.mes(mesTexto);
        const ids = await this.empresasDeConsulta(activeUser.idTenant, alcance);
        const { inicio, fin } = rangoMes(mes);
        const crudas = ids && !ids.length
            ? []
            : await this.prisma.waConsumo.findMany({
                where: {
                    idTenant: activeUser.idTenant,
                    EnviadoEn: { gte: inicio, lt: fin },
                    ...(ids ? { idEmpresa: { in: ids } } : {}),
                },
                orderBy: { EnviadoEn: 'asc' },
            });
        const filas = crudas.filter((fila) => fila.idTenant === activeUser.idTenant);
        const nombres = await this.nombres(activeUser.idTenant, [...new Set(filas.map((fila) => fila.idEmpresa))]);
        const porId = new Map(nombres.map((empresa) => [empresa.idEmpresa, empresa.nombre_comercial]));
        return {
            mes,
            columns: COLUMNAS_DETALLE,
            rows: filas.map((fila) => ({
                empresa: porId.get(fila.idEmpresa) ?? String(fila.idEmpresa),
                categoria: fila.CategoriaInterna,
                plantilla: fila.Plantilla,
                estatus: fila.Estatus,
                costo: aNumero(fila.Costo),
                moneda: fila.Moneda,
                enviadoEn: fila.EnviadoEn,
                telefono: fila.TelefonoUlt4,
            })),
        };
    }

    async obtenerTope(activeUser: ActiveUserDto, companyId: number) {
        const alcance = await this.alcance(activeUser, companyId);
        const ids = await this.empresasDeConsulta(activeUser.idTenant, alcance);
        const filas = await this.prisma.waTopes.findMany({
            where: {
                idTenant: activeUser.idTenant,
                ...(ids ? { OR: [{ idEmpresa: null }, { idEmpresa: { in: ids } }] } : {}),
            },
            orderBy: { id: 'asc' },
        });
        const nombres = await this.nombres(
            activeUser.idTenant,
            filas.map((fila) => fila.idEmpresa).filter((id): id is number => id != null),
        );
        const porId = new Map(nombres.map((empresa) => [empresa.idEmpresa, empresa.nombre_comercial]));
        return {
            tenant: aTope(filas.find((fila) => fila.idEmpresa == null) ?? null),
            empresas: filas
                .filter((fila) => fila.idEmpresa != null && fila.idTenant === activeUser.idTenant)
                .map((fila) => ({
                    ...aTope(fila),
                    idEmpresa: fila.idEmpresa,
                    nombre: porId.get(fila.idEmpresa!) ?? '',
                })),
        };
    }

    async guardarTope(activeUser: ActiveUserDto, companyId: number, dto: ActualizarTopeDto) {
        const alcance = await this.alcance(activeUser, companyId);
        const idEmpresa = dto.idEmpresa ?? null;
        if (idEmpresa == null && !alcance.puedeTopeTenant) {
            throw errorComms(
                HttpStatus.FORBIDDEN,
                'FUERA_DE_ALCANCE',
                'El tope de toda la organización requiere alcance de tenant.',
            );
        }
        if (idEmpresa != null) await this.empresasDeConsulta(activeUser.idTenant, alcance, idEmpresa);
        const guardado = await this.prisma.$transaction(async (tx) => {
            const actual = await tx.waTopes.findFirst({
                where: { idTenant: activeUser.idTenant, idEmpresa },
                orderBy: { id: 'desc' },
            });
            if (actual) {
                return tx.waTopes.update({
                    where: { id: actual.id },
                    data: {
                        TopeMensual: dto.topeMensual,
                        Accion: dto.accion,
                        Activo: dto.activo ?? actual.Activo,
                    },
                });
            }
            return tx.waTopes.create({
                data: {
                    idTenant: activeUser.idTenant,
                    idEmpresa,
                    TopeMensual: dto.topeMensual,
                    Accion: dto.accion,
                    Activo: dto.activo ?? true,
                },
            });
        }, TRANSACCION);
        return {
            id: guardado.id,
            idEmpresa: guardado.idEmpresa,
            topeMensual: aNumero(guardado.TopeMensual),
            accion: guardado.Accion,
            activo: guardado.Activo,
        };
    }

    private async alcance(activeUser: ActiveUserDto, companyId: number): Promise<AlcanceUso> {
        const efectivas = await this.capabilities.getEffective(activeUser, companyId);
        const utiles = efectivas.filter((item) => item.codigo === 'CFG_CANALES' || item.codigo === 'COM_VER_ANALITICA');
        if (!utiles.length) {
            throw errorComms(HttpStatus.FORBIDDEN, 'SIN_CAPACIDAD', 'No tienes permiso para ver el consumo de WhatsApp.');
        }
        if (utiles.some((item) => item.alcance === 'TENANT')) return { empresas: null, puedeTopeTenant: true };
        return { empresas: empresasNombradas(utiles, companyId), puedeTopeTenant: false };
    }

    private async empresasDeConsulta(idTenant: number, alcance: AlcanceUso, empresa?: number): Promise<number[] | null> {
        if (empresa != null) {
            if (alcance.empresas && !alcance.empresas.includes(empresa)) {
                throw errorComms(HttpStatus.FORBIDDEN, 'FUERA_DE_ALCANCE', 'Esa empresa está fuera de tu alcance.', { ids: [empresa] });
            }
            await this.empresaDelTenant(idTenant, empresa);
            return [empresa];
        }
        if (!alcance.empresas) return null;
        const propias = await this.prisma.catEmpresas.findMany({
            where: { idTenant, idEmpresa: { in: alcance.empresas } },
            select: { idEmpresa: true },
        });
        return propias.map((fila) => fila.idEmpresa);
    }

    private async empresaDelTenant(idTenant: number, idEmpresa: number): Promise<void> {
        const fila = await this.prisma.catEmpresas.findFirst({ where: { idEmpresa, idTenant }, select: { idEmpresa: true } });
        if (!fila) {
            throw errorComms(HttpStatus.FORBIDDEN, 'FUERA_DE_ALCANCE', 'Esa empresa no pertenece a tu organización.', { ids: [idEmpresa] });
        }
    }

    private async grupos(idTenant: number, mes: string, ids: number[] | null, categoria?: string): Promise<FilaGrupo[]> {
        if (ids && !ids.length) return [];
        const { inicio, fin } = rangoMes(mes);
        const grupos = await this.prisma.waConsumo.groupBy({
            by: ['idEmpresa', 'CategoriaInterna'],
            where: {
                idTenant,
                EnviadoEn: { gte: inicio, lt: fin },
                Estatus: { not: 'FALLIDO' },
                ...(ids ? { idEmpresa: { in: ids } } : {}),
                ...(categoria ? { CategoriaInterna: categoria } : {}),
            },
            _sum: { Costo: true },
            _count: { _all: true },
        });
        return grupos.map((grupo) => ({
            idTenant,
            idEmpresa: grupo.idEmpresa,
            categoria: grupo.CategoriaInterna,
            mensajes: grupo._count._all,
            costo: aNumero(grupo._sum.Costo),
        }));
    }

    private async topeAplicable(idTenant: number, idEmpresa: number | null, consumo: number): Promise<EstadoTope | null> {
        const filas = await this.prisma.waTopes.findMany({
            where: {
                idTenant,
                Activo: true,
                ...(idEmpresa != null ? { OR: [{ idEmpresa }, { idEmpresa: null }] } : { idEmpresa: null }),
            },
            orderBy: { id: 'desc' },
        });
        const fila = idEmpresa == null
            ? (filas.find((item) => item.idEmpresa == null) ?? null)
            : (filas.find((item) => item.idEmpresa === idEmpresa) ?? filas.find((item) => item.idEmpresa == null) ?? null);
        return evaluarTope({
            consumo,
            tope: fila ? aNumero(fila.TopeMensual) : null,
            accion: fila?.Accion ?? null,
            prioridad: 'NORMAL',
        });
    }

    private async nombres(idTenant: number, ids: number[] | null) {
        if (ids && !ids.length) return [];
        return this.prisma.catEmpresas.findMany({
            where: { idTenant, ...(ids ? { idEmpresa: { in: ids } } : {}) },
            select: { idEmpresa: true, nombre_comercial: true },
            orderBy: { nombre_comercial: 'asc' },
        });
    }

    private mes(valor: string | undefined): string {
        const mes = valor?.trim() || mesActual(new Date());
        if (!mesValido(mes)) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'El mes debe tener la forma AAAA-MM.');
        }
        return mes;
    }

    private corte(mes: string, ahora: Date): Date {
        const fin = rangoMes(mes).fin.getTime();
        return fin > ahora.getTime() ? ahora : new Date(fin - 1);
    }
}

const COLUMNAS_DETALLE: ExcelColumn<{
    empresa: string;
    categoria: string;
    plantilla: string;
    estatus: string;
    costo: number;
    moneda: string;
    enviadoEn: Date;
    telefono: string;
}>[] = [
    { header: 'Empresa', key: 'empresa', width: 32 },
    { header: 'Categoría', key: 'categoria', width: 18 },
    { header: 'Plantilla', key: 'plantilla', width: 28 },
    { header: 'Estatus', key: 'estatus', width: 14 },
    { header: 'Costo', key: 'costo', width: 12 },
    { header: 'Moneda', key: 'moneda', width: 10 },
    { header: 'Enviado', key: 'enviadoEn', width: 22 },
    { header: 'Teléfono', key: 'telefono', width: 12 },
];

function empresasNombradas(utiles: CapacidadEfectiva[], companyId: number): number[] {
    const ids = new Set<number>();
    for (const item of utiles) {
        if (item.alcance === 'EMPRESAS') {
            for (const id of item.referencias ?? []) ids.add(id);
        }
    }
    if (!ids.size) ids.add(companyId);
    return [...ids];
}

function aTope(fila: { id: number; TopeMensual: unknown; Accion: string; Activo: boolean } | null) {
    if (!fila) return null;
    return {
        id: fila.id,
        topeMensual: aNumero(fila.TopeMensual),
        accion: fila.Accion,
        activo: fila.Activo,
    };
}
