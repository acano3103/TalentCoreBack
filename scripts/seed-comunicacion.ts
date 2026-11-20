import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import { PrismaClient } from '../generated/prisma/client';
import { ComAcuseModo, ComPrioridad } from '../generated/prisma/enums';
import {
    aplicarSemillas,
    clavePrecioGlobal,
    FilaCanal,
    FilaCapacidad,
    FilaPrecioGlobal,
    FilaTipoComunicado,
    FilaTipoNotificacion,
    FilaTipoPersonal,
    SemillaStore,
} from './seed-comunicacion-catalogos';

dotenv.config();

function storeDePrisma(prisma: PrismaClient): SemillaStore {
    return {
        async listarTenants() {
            const tenants = await prisma.catTenants.findMany({ select: { idTenant: true } });
            return tenants.map((tenant) => tenant.idTenant);
        },
        async listarTiposPersonal() {
            const filas = await prisma.catTiposPersonal.findMany({
                select: { idTenant: true, Codigo: true, Nombre: true },
            });
            return filas.map((fila) => ({
                idTenant: fila.idTenant,
                codigo: fila.Codigo,
                nombre: fila.Nombre,
            }));
        },
        async insertarTiposPersonal(filas: FilaTipoPersonal[]) {
            await prisma.catTiposPersonal.createMany({
                data: filas.map((fila) => ({
                    idTenant: fila.idTenant,
                    Codigo: fila.codigo,
                    Nombre: fila.nombre,
                    Activo: true,
                })),
            });
        },
        async listarTiposComunicado() {
            const filas = await prisma.comTiposComunicado.findMany({
                select: {
                    idTenant: true,
                    Codigo: true,
                    Nombre: true,
                    PrioridadDefault: true,
                    AcuseDefault: true,
                    ModalDefault: true,
                    IdentidadDefault: true,
                    EsCorto: true,
                },
            });
            return filas.map((fila) => ({
                idTenant: fila.idTenant,
                codigo: fila.Codigo,
                nombre: fila.Nombre,
                prioridadDefault: fila.PrioridadDefault,
                acuseDefault: fila.AcuseDefault,
                modalDefault: fila.ModalDefault,
                identidadDefault: fila.IdentidadDefault,
                esCorto: fila.EsCorto,
            }));
        },
        async insertarTiposComunicado(filas: FilaTipoComunicado[]) {
            await prisma.comTiposComunicado.createMany({
                data: filas.map((fila) => ({
                    idTenant: fila.idTenant,
                    Codigo: fila.codigo,
                    Nombre: fila.nombre,
                    PrioridadDefault: fila.prioridadDefault as ComPrioridad,
                    AcuseDefault: fila.acuseDefault as ComAcuseModo,
                    ModalDefault: fila.modalDefault,
                    IdentidadDefault: fila.identidadDefault,
                    EsCorto: fila.esCorto,
                    Activo: true,
                })),
            });
        },
        async listarCapacidades() {
            const filas = await prisma.catComCapacidades.findMany({ select: { Codigo: true } });
            return filas.map((fila) => ({ codigo: fila.Codigo }));
        },
        async insertarCapacidades(filas: FilaCapacidad[]) {
            await prisma.catComCapacidades.createMany({
                data: filas.map((fila) => ({
                    Codigo: fila.codigo,
                    Descripcion: fila.descripcion,
                    Fase: fila.fase,
                })),
            });
        },
        async listarCanales() {
            const filas = await prisma.catCanalesNotificaciones.findMany({ select: { code: true } });
            return filas.map((fila) => ({ code: fila.code }));
        },
        async insertarCanales(filas: FilaCanal[]) {
            await prisma.catCanalesNotificaciones.createMany({
                data: filas.map((fila) => ({
                    code: fila.code,
                    description: fila.description,
                    activo: true,
                })),
            });
        },
        async listarTiposNotificacion() {
            const filas = await prisma.catTipoNotificacion.findMany({
                select: { code: true },
                where: { code: { not: null } },
            });
            return filas.flatMap((fila) => (fila.code ? [{ code: fila.code }] : []));
        },
        async insertarTiposNotificacion(filas: FilaTipoNotificacion[]) {
            await prisma.catTipoNotificacion.createMany({
                data: filas.map((fila) => ({
                    code: fila.code,
                    description: fila.description,
                    activo: true,
                })),
            });
        },
        async listarPreciosGlobales() {
            const filas = await prisma.waPrecios.findMany({
                select: { VigenteDesde: true },
                where: { idTenant: null },
            });
            return filas.map((fila) => ({ vigenteDesde: clavePrecioGlobal(fila.VigenteDesde) }));
        },
        async insertarPreciosGlobales(filas: FilaPrecioGlobal[]) {
            await prisma.waPrecios.createMany({
                data: filas.map((fila) => ({
                    idTenant: null,
                    PrecioBase: fila.precioBase,
                    Moneda: fila.moneda,
                    VigenteDesde: new Date(`${fila.vigenteDesde}T00:00:00.000Z`),
                    CreadoPor: fila.creadoPor,
                })),
            });
        },
    };
}

async function main() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        throw new Error('Falta DATABASE_URL. No se pueden sembrar los catálogos de comunicación.');
    }

    const prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl) });
    try {
        const resumen = await aplicarSemillas(storeDePrisma(prisma));
        console.log(`Semillas de comunicación listas. Filas nuevas: ${resumen.total}`);
        console.log(JSON.stringify(resumen.insertados, null, 2));
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((error: unknown) => {
        const mensaje = error instanceof Error ? error.message : 'Error al sembrar comunicación';
        console.error(mensaje);
        process.exit(1);
    });
}
