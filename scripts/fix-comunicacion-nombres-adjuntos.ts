/**
 * Repara nombres de adjuntos guardados con el mojibake de Multer
 * (UTF-8 leído como latin1: «Módulos» quedó «MÃ³dulos»). Idempotente.
 *
 *   npm run fix:comunicacion-nombres-adjuntos
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import { PrismaClient } from '../generated/prisma/client';
import { nombreRecibido } from '../src/modules/communications/announcements/nombre-recibido';

/** «Ã» seguido de otro carácter: el patrón de un byte UTF-8 leído como latin1. */
const PATRON_MOJIBAKE = /Ã./;

export interface AdjuntoNombre {
    idAdjunto: number;
    Nombre: string;
}

export interface NombresAdjuntosStore {
    listarSospechosos(): Promise<AdjuntoNombre[]>;
    actualizarNombre(idAdjunto: number, nombre: string): Promise<void>;
}

export function repararNombreAdjunto(nombre: string): string | null {
    if (!PATRON_MOJIBAKE.test(nombre)) return null;
    const reparado = nombreRecibido(nombre);
    if (!reparado || reparado === nombre) return null;
    return reparado.slice(0, 255);
}

export async function aplicarReparacionNombres(store: NombresAdjuntosStore): Promise<number> {
    const filas = await store.listarSospechosos();
    let cambiados = 0;
    for (const fila of filas) {
        const reparado = repararNombreAdjunto(fila.Nombre);
        if (!reparado) continue;
        await store.actualizarNombre(fila.idAdjunto, reparado);
        cambiados += 1;
    }
    return cambiados;
}

export function storeDePrisma(prisma: PrismaClient): NombresAdjuntosStore {
    return {
        async listarSospechosos() {
            return prisma.comComunicadoAdjuntos.findMany({
                where: { Nombre: { contains: 'Ã' } },
                select: { idAdjunto: true, Nombre: true },
            });
        },
        async actualizarNombre(idAdjunto, nombre) {
            await prisma.comComunicadoAdjuntos.update({ where: { idAdjunto }, data: { Nombre: nombre } });
        },
    };
}

function imprimir(cambiados: number) {
    console.log(`Nombres de adjuntos reparados: ${cambiados}.`);
}

async function main() {
    dotenv.config();
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        throw new Error('Falta DATABASE_URL. No se pueden reparar los nombres de los adjuntos.');
    }
    const prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl) });
    try {
        const cambiados = await aplicarReparacionNombres(storeDePrisma(prisma));
        imprimir(cambiados);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((error: unknown) => {
        const mensaje = error instanceof Error ? error.message : 'Error al reparar los nombres de los adjuntos';
        console.error(mensaje);
        process.exit(1);
    });
}
