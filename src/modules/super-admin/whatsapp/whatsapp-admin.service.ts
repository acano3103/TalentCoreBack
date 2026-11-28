import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ExcelColumn } from 'src/common/services/excel-export.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { errorComms } from 'src/modules/communications/comms-http';
import { FilaPrecioWa, precioVigente } from 'src/modules/communications/delivery/precio-wa';
import {
    aNumero,
    marcarEstados,
    mesActual,
    mesValido,
    porcentajeDe,
    rangoMes,
    redondear,
    vigenciaPermitida,
} from 'src/modules/communications/whatsapp-usage/periodo';
import { CrearPrecioDto, TopeTenantDto } from './dto/precio-wa.dto';

const TRANSACCION = { maxWait: 15_000, timeout: 20_000 };

@Injectable()
export class WhatsappAdminService {
    constructor(private readonly prisma: PrismaService) {}

    async uso(mesTexto?: string, idTenant?: number) {
        const mes = this.mes(mesTexto);
        const { inicio, fin } = rangoMes(mes);
        const ahora = new Date();
        const corte = this.corte(mes, ahora);
        const tenants = await this.prisma.catTenants.findMany({
            where: idTenant != null ? { idTenant } : {},
            select: { idTenant: true, nombre: true },
            orderBy: { nombre: 'asc' },
        });
        const ids = tenants.map((tenant) => tenant.idTenant);
        const grupos = ids.length
            ? await this.prisma.waConsumo.groupBy({
                by: ['idTenant'],
                where: { idTenant: { in: ids }, EnviadoEn: { gte: inicio, lt: fin }, Estatus: { not: 'FALLIDO' } },
                _sum: { Costo: true },
                _count: { _all: true },
            })
            : [];
        const precios = await this.prisma.waPrecios.findMany({
            where: {
                VigenteDesde: { lte: corte },
                OR: [{ idTenant: null }, ...(ids.length ? [{ idTenant: { in: ids } }] : [])],
            },
        });
        const topes = ids.length
            ? await this.prisma.waTopes.findMany({
                where: { idEmpresa: null, Activo: true, idTenant: { in: ids } },
                orderBy: { id: 'desc' },
            })
            : [];
        const consumo = new Map(grupos.map((grupo) => [grupo.idTenant, grupo]));
        const filasPrecio = precios.map(aFila);
        return {
            mes,
            tenants: tenants.map((tenant) => {
                const grupo = consumo.get(tenant.idTenant);
                const precio = precioVigente(filasPrecio, tenant.idTenant, corte, 'NORMAL');
                const tope = topes.find((fila) => fila.idTenant === tenant.idTenant);
                const costo = redondear(aNumero(grupo?._sum.Costo), 4);
                const topeMensual = tope ? aNumero(tope.TopeMensual) : null;
                return {
                    idTenant: tenant.idTenant,
                    nombre: tenant.nombre,
                    mensajes: grupo?._count._all ?? 0,
                    precioVigente: precio?.precio ?? null,
                    moneda: precio?.moneda ?? 'MXN',
                    costo,
                    tope: topeMensual,
                    porcentaje: topeMensual == null ? null : porcentajeDe(costo, topeMensual),
                };
            }),
        };
    }

    async usoTenant(idTenant: number, mesTexto?: string) {
        await this.tenantExiste(idTenant);
        const general = await this.uso(mesTexto, idTenant);
        const mes = general.mes;
        const { inicio, fin } = rangoMes(mes);
        const grupos = await this.prisma.waConsumo.groupBy({
            by: ['idEmpresa', 'CategoriaInterna'],
            where: { idTenant, EnviadoEn: { gte: inicio, lt: fin }, Estatus: { not: 'FALLIDO' } },
            _sum: { Costo: true },
            _count: { _all: true },
        });
        const empresas = await this.prisma.catEmpresas.findMany({
            where: { idTenant },
            select: { idEmpresa: true, nombre_comercial: true },
            orderBy: { nombre_comercial: 'asc' },
        });
        return {
            ...general,
            empresas: empresas.map((empresa) => {
                const propias = grupos.filter((grupo) => grupo.idEmpresa === empresa.idEmpresa && grupo.idEmpresa !== undefined);
                return {
                    idEmpresa: empresa.idEmpresa,
                    nombre: empresa.nombre_comercial,
                    mensajes: propias.reduce((suma, grupo) => suma + grupo._count._all, 0),
                    costo: redondear(propias.reduce((suma, grupo) => suma + aNumero(grupo._sum.Costo), 0), 4),
                };
            }).filter((empresa) => empresa.mensajes > 0),
        };
    }

    columnasExport(mesTexto?: string) {
        return this.uso(mesTexto).then((resumen) => ({
            mes: resumen.mes,
            columns: COLUMNAS,
            rows: resumen.tenants,
        }));
    }

    async precios(idTenant?: number) {
        const filas = await this.prisma.waPrecios.findMany({
            where: idTenant != null ? { OR: [{ idTenant }, { idTenant: null }] } : {},
            orderBy: [{ VigenteDesde: 'desc' }, { id: 'desc' }],
        });
        return marcarEstados(filas.map(aFila), new Date()).map((fila) => ({
            id: fila.id,
            idTenant: fila.idTenant,
            precioBase: fila.precioBase,
            preciosCategoria: fila.preciosCategoria,
            moneda: fila.moneda,
            vigenteDesde: fila.vigenteDesde,
            estado: fila.estado,
        }));
    }

    async crearPrecio(activeUser: ActiveUserDto, dto: CrearPrecioDto) {
        const vigenteDesde = new Date(dto.vigenteDesde);
        if (Number.isNaN(vigenteDesde.getTime()) || !vigenciaPermitida(vigenteDesde, new Date())) {
            throw errorComms(
                HttpStatus.BAD_REQUEST,
                'CONTENIDO_INVALIDO',
                'La vigencia tiene que ser hoy o un día posterior. Las versiones ya vigentes no se editan.',
            );
        }
        const idTenant = dto.idTenant ?? null;
        if (idTenant != null) await this.tenantExiste(idTenant);
        const categorias = leerCategorias(dto.preciosCategoria);
        const moneda = (dto.moneda ?? 'MXN').trim().toUpperCase();
        const empresaBitacora = idTenant == null
            ? 0
            : ((await this.prisma.catEmpresas.findFirst({ where: { idTenant }, select: { idEmpresa: true } }))?.idEmpresa ?? 0);
        const creado = await this.prisma.$transaction(async (tx) => {
            const precio = await tx.waPrecios.create({
                data: {
                    idTenant,
                    PrecioBase: dto.precioBase,
                    PreciosCategoria: categorias,
                    Moneda: moneda,
                    VigenteDesde: vigenteDesde,
                    CreadoPor: activeUser.uuid,
                },
            });
            await tx.historicoMovimientos.create({
                data: {
                    idUsuario: activeUser.id,
                    idEmpresa: empresaBitacora,
                    accion: 'CREAR',
                    tablaOrigen: 'WaPrecios',
                    idRegistro: String(precio.id),
                    descripcion: `${activeUser.first_name} ${activeUser.last_name} registró un precio de WhatsApp.`,
                    detalles_json: {
                        idTenant,
                        precioBase: dto.precioBase,
                        moneda,
                        vigenteDesde: vigenteDesde.toISOString(),
                    },
                    fechaCreacion: new Date(),
                },
            });
            return precio;
        }, TRANSACCION);
        return {
            id: creado.id,
            idTenant: creado.idTenant,
            precioBase: aNumero(creado.PrecioBase),
            moneda: creado.Moneda,
            vigenteDesde: creado.VigenteDesde,
        };
    }

    async guardarTope(idTenant: number, dto: TopeTenantDto) {
        await this.tenantExiste(idTenant);
        const idEmpresa = dto.idEmpresa ?? null;
        if (idEmpresa != null) {
            const empresa = await this.prisma.catEmpresas.findFirst({ where: { idEmpresa, idTenant }, select: { idEmpresa: true } });
            if (!empresa) {
                throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'Esa empresa no pertenece al tenant.');
            }
        }
        const guardado = await this.prisma.$transaction(async (tx) => {
            const actual = await tx.waTopes.findFirst({ where: { idTenant, idEmpresa }, orderBy: { id: 'desc' } });
            if (actual) {
                return tx.waTopes.update({
                    where: { id: actual.id },
                    data: { TopeMensual: dto.topeMensual, Accion: dto.accion },
                });
            }
            return tx.waTopes.create({
                data: { idTenant, idEmpresa, TopeMensual: dto.topeMensual, Accion: dto.accion, Activo: true },
            });
        }, TRANSACCION);
        return {
            id: guardado.id,
            idTenant: guardado.idTenant,
            idEmpresa: guardado.idEmpresa,
            topeMensual: aNumero(guardado.TopeMensual),
            accion: guardado.Accion,
        };
    }

    private async tenantExiste(idTenant: number): Promise<void> {
        const tenant = await this.prisma.catTenants.findUnique({ where: { idTenant }, select: { idTenant: true } });
        if (!tenant) throw errorComms(HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'No encontramos ese tenant.');
    }

    private mes(valor: string | undefined): string {
        const mes = valor?.trim() || mesActual(new Date());
        if (!mesValido(mes)) throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'El mes debe tener la forma AAAA-MM.');
        return mes;
    }

    private corte(mes: string, ahora: Date): Date {
        const fin = rangoMes(mes).fin.getTime();
        return fin > ahora.getTime() ? ahora : new Date(fin - 1);
    }
}

function aFila(fila: {
    id: number;
    idTenant: number | null;
    PrecioBase: unknown;
    PreciosCategoria: unknown;
    Moneda: string;
    VigenteDesde: Date;
}): FilaPrecioWa & { id: number } {
    return {
        id: fila.id,
        idTenant: fila.idTenant,
        precioBase: aNumero(fila.PrecioBase),
        preciosCategoria: fila.PreciosCategoria,
        moneda: fila.Moneda,
        vigenteDesde: fila.VigenteDesde,
    };
}

function leerCategorias(valor: Record<string, number> | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (valor == null) return Prisma.JsonNull;
    const limpio: Record<string, number> = {};
    for (const [clave, crudo] of Object.entries(valor)) {
        const codigo = clave.trim().toUpperCase();
        if (!/^[A-Z0-9_]{1,20}$/.test(codigo)) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'La categoría del precio no es válida.');
        }
        const numero = typeof crudo === 'number' ? crudo : Number(crudo);
        if (!Number.isFinite(numero) || numero < 0) {
            throw errorComms(HttpStatus.BAD_REQUEST, 'CONTENIDO_INVALIDO', 'El precio de la categoría no es válido.');
        }
        limpio[codigo] = numero;
    }
    return limpio;
}

const COLUMNAS: ExcelColumn<{
    idTenant: number;
    nombre: string;
    mensajes: number;
    precioVigente: number | null;
    moneda: string;
    costo: number;
    tope: number | null;
    porcentaje: number | null;
}>[] = [
    { header: 'Tenant', key: 'idTenant', width: 12 },
    { header: 'Nombre', key: 'nombre', width: 32 },
    { header: 'Mensajes', key: 'mensajes', width: 14 },
    { header: 'Precio vigente', key: 'precioVigente', width: 16 },
    { header: 'Moneda', key: 'moneda', width: 10 },
    { header: 'Costo', key: 'costo', width: 14 },
    { header: 'Tope', key: 'tope', width: 14 },
    { header: 'Porcentaje', key: 'porcentaje', width: 14 },
];
