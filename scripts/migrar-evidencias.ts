/**
 * Mueve selfies legacy de `<repo>/media/attendance` a MEDIA_ROOT_PATH/<slug>/attendance
 * y actualiza AsistenciaEvidencias.rutaArchivo y RegistrosAsistencia.urlFoto.
 *
 *   npm run migrar:evidencias -- --dry-run
 *   npm run migrar:evidencias
 *   npm run migrar:evidencias -- --borrar-origen
 *
 * Por defecto copia y deja el original. Hay que correrlo con el API detenido.
 */
import { createHash } from 'crypto';
import { copyFile, mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'fs/promises';
import { dirname, join, relative, resolve } from 'path';
import * as dotenv from 'dotenv';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';
import {
    claveArchivo,
    idEmpresaDeRuta,
    normalizarRaiz,
    relativaEnOrigen,
    rutaNueva,
    unirDentro,
} from './migrar-evidencias-asistencia';

dotenv.config();

const LOTE = 200;

type Problema = {
    idEvidencia: number | null;
    rutaVieja: string | null;
    motivo: string;
};

type Totales = {
    revisadas: number;
    copiadas: number;
    yaExistian: number;
    bdActualizada: number;
    faltantes: number;
    conflictos: number;
    invalidas: number;
    errores: number;
    huerfanosCopiados: number;
    huerfanosSinTenant: number;
};

type EvidenciaLegacy = {
    idEvidencia: number;
    idTenant: number;
    rutaArchivo: string | null;
    hashSha256: string | null;
};

function parseDbUrl(url: string) {
    const u = new URL(url);
    return {
        host: u.hostname,
        port: parseInt(u.port || '3306', 10),
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.replace(/^\//, ''),
        connectionLimit: 5,
        acquireTimeout: 30_000,
        connectTimeout: 30_000,
        idleTimeout: 60_000,
        minimumIdle: 1,
    };
}

function crearPrisma(): PrismaClient {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        throw new Error('Falta DATABASE_URL. No se puede migrar las evidencias.');
    }
    const adapter = new PrismaMariaDb(parseDbUrl(dbUrl) as any);
    return new PrismaClient({ adapter });
}

function argumentos(): { dryRun: boolean; borrarOrigen: boolean } {
    const args = process.argv.slice(2);
    const desconocidos = args.filter((arg) => arg !== '--dry-run' && arg !== '--borrar-origen');
    if (desconocidos.length > 0) {
        throw new Error(
            `Argumento no reconocido: ${desconocidos.join(', ')}. Usa --dry-run o --borrar-origen.`,
        );
    }
    // npm se queda con --dry-run (es una opción suya) y lo expone en el entorno.
    const desdeNpm = process.env.npm_config_dry_run;
    const dryRun =
        args.includes('--dry-run') ||
        desdeNpm === 'true' ||
        desdeNpm === '1';
    return { dryRun, borrarOrigen: !dryRun && args.includes('--borrar-origen') };
}

function marcaTiempo(): string {
    const ahora = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${ahora.getFullYear()}${p(ahora.getMonth() + 1)}${p(ahora.getDate())}-${p(ahora.getHours())}${p(ahora.getMinutes())}${p(ahora.getSeconds())}`;
}

async function sha256De(ruta: string): Promise<string> {
    const buffer = await readFile(ruta);
    return createHash('sha256').update(buffer).digest('hex');
}

async function esArchivo(ruta: string): Promise<boolean> {
    try {
        const info = await stat(ruta);
        return info.isFile();
    } catch {
        return false;
    }
}

async function listarArchivos(dir: string): Promise<string[]> {
    let entradas;
    try {
        entradas = await readdir(dir, { withFileTypes: true });
    } catch {
        return [];
    }
    const archivos: string[] = [];
    for (const entrada of entradas) {
        const abs = join(dir, entrada.name);
        if (entrada.isDirectory()) {
            archivos.push(...(await listarArchivos(abs)));
        } else if (entrada.isFile()) {
            archivos.push(abs);
        }
    }
    return archivos;
}

function hashesIguales(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function main() {
    const { dryRun, borrarOrigen } = argumentos();
    const origenRaiz = resolve(process.cwd(), 'media');
    const destinoRaiz = normalizarRaiz(process.env.MEDIA_ROOT_PATH);

    if (!destinoRaiz) {
        throw new Error(
            'Falta MEDIA_ROOT_PATH. Define la carpeta raíz de medios antes de migrar las evidencias.',
        );
    }
    if (resolve(origenRaiz) === resolve(destinoRaiz)) {
        throw new Error(
            `El origen y el destino son la misma carpeta (${origenRaiz}). No se migró nada.`,
        );
    }

    const prisma = crearPrisma();
    const totales: Totales = {
        revisadas: 0,
        copiadas: 0,
        yaExistian: 0,
        bdActualizada: 0,
        faltantes: 0,
        conflictos: 0,
        invalidas: 0,
        errores: 0,
        huerfanosCopiados: 0,
        huerfanosSinTenant: 0,
    };
    const problemas: Problema[] = [];
    const procesados = new Set<string>();
    const slugs = new Map<number, string | null>();
    const tenantsPorEmpresa = new Map<number, number | null>();

    console.log(dryRun ? 'Simulación (--dry-run): no se escribe nada.' : 'Migración de evidencias de asistencia.');
    console.log(`Origen:  ${origenRaiz}`);
    console.log(`Destino: ${destinoRaiz}`);
    if (borrarOrigen) console.log('Se borrará el original después de copiar y actualizar la base.');

    try {
        await migrarFilas(
            prisma,
            origenRaiz,
            destinoRaiz,
            dryRun,
            borrarOrigen,
            totales,
            problemas,
            procesados,
            slugs,
        );
        await migrarHuerfanos(
            prisma,
            origenRaiz,
            destinoRaiz,
            dryRun,
            totales,
            problemas,
            procesados,
            slugs,
            tenantsPorEmpresa,
        );
    } finally {
        await prisma.$disconnect();
    }

    const reporte = {
        dryRun,
        borrarOrigen,
        origen: origenRaiz,
        destino: destinoRaiz,
        fecha: new Date().toISOString(),
        totales,
        problemas,
    };
    const logsDir = join(process.cwd(), 'scripts', 'logs');
    await mkdir(logsDir, { recursive: true });
    const archivo = join(logsDir, `migrar-evidencias-${marcaTiempo()}.json`);
    await writeFile(archivo, JSON.stringify(reporte, null, 2), 'utf8');

    console.log('');
    console.log('Totales');
    console.log(`  revisadas:            ${totales.revisadas}`);
    console.log(`  copiadas:             ${totales.copiadas}`);
    console.log(`  ya existían:          ${totales.yaExistian}`);
    console.log(`  BD actualizada:       ${totales.bdActualizada}`);
    console.log(`  faltantes:            ${totales.faltantes}`);
    console.log(`  conflictos:           ${totales.conflictos}`);
    console.log(`  inválidas:            ${totales.invalidas}`);
    console.log(`  errores:              ${totales.errores}`);
    console.log(`  huérfanos copiados:   ${totales.huerfanosCopiados}`);
    console.log(`  huérfanos sin tenant: ${totales.huerfanosSinTenant}`);
    if (problemas.length > 0) {
        console.log('');
        console.log('Problemas');
        for (const problema of problemas) {
            console.log(
                `  #${problema.idEvidencia ?? '-'}  ${problema.rutaVieja ?? '(sin ruta)'}  — ${problema.motivo}`,
            );
        }
    }
    console.log('');
    console.log(`Reporte: ${archivo}`);
    if (dryRun) console.log('No se modificó ningún archivo ni la base de datos.');
}

async function slugDe(
    prisma: PrismaClient,
    idTenant: number,
    slugs: Map<number, string | null>,
): Promise<string | null> {
    if (slugs.has(idTenant)) return slugs.get(idTenant) ?? null;
    const tenant = await prisma.catTenants.findUnique({
        where: { idTenant },
        select: { slug: true },
    });
    const slug = tenant?.slug?.trim() || null;
    slugs.set(idTenant, slug);
    return slug;
}

async function migrarFilas(
    prisma: PrismaClient,
    origenRaiz: string,
    destinoRaiz: string,
    dryRun: boolean,
    borrarOrigen: boolean,
    totales: Totales,
    problemas: Problema[],
    procesados: Set<string>,
    slugs: Map<number, string | null>,
) {
    let cursor = 0;
    for (;;) {
        const lote = await prisma.asistenciaEvidencias.findMany({
            where: {
                idEvidencia: { gt: cursor },
                OR: [
                    { rutaArchivo: { startsWith: 'media/attendance/' } },
                    { rutaArchivo: { startsWith: 'attendance/' } },
                ],
            },
            orderBy: { idEvidencia: 'asc' },
            take: LOTE,
            select: {
                idEvidencia: true,
                idTenant: true,
                rutaArchivo: true,
                hashSha256: true,
            },
        });
        if (lote.length === 0) break;
        cursor = lote[lote.length - 1].idEvidencia;

        for (const evidencia of lote) {
            totales.revisadas += 1;
            await procesarEvidencia(
                prisma,
                evidencia,
                origenRaiz,
                destinoRaiz,
                dryRun,
                borrarOrigen,
                totales,
                problemas,
                procesados,
                slugs,
            );
        }
    }
}

async function procesarEvidencia(
    prisma: PrismaClient,
    evidencia: EvidenciaLegacy,
    origenRaiz: string,
    destinoRaiz: string,
    dryRun: boolean,
    borrarOrigen: boolean,
    totales: Totales,
    problemas: Problema[],
    procesados: Set<string>,
    slugs: Map<number, string | null>,
) {
    const rutaVieja = evidencia.rutaArchivo ?? '';
    const slug = await slugDe(prisma, evidencia.idTenant, slugs);
    const relativaNueva = slug ? rutaNueva(rutaVieja, slug) : null;
    const relativaOrigen = relativaEnOrigen(rutaVieja);
    const origenAbs = relativaOrigen ? unirDentro(origenRaiz, relativaOrigen) : null;
    const destinoAbs = relativaNueva ? unirDentro(destinoRaiz, relativaNueva) : null;

    if (!slug || !relativaNueva || !origenAbs || !destinoAbs) {
        totales.invalidas += 1;
        problemas.push({
            idEvidencia: evidencia.idEvidencia,
            rutaVieja,
            motivo: slug
                ? 'La ruta se sale de la carpeta de origen o de destino.'
                : `El tenant ${evidencia.idTenant} no existe o no tiene slug.`,
        });
        return;
    }

    if (await esArchivo(origenAbs)) procesados.add(claveArchivo(origenAbs));

    try {
        if (!(await esArchivo(origenAbs))) {
            totales.faltantes += 1;
            problemas.push({
                idEvidencia: evidencia.idEvidencia,
                rutaVieja,
                motivo: 'No está el archivo de origen.',
            });
            console.log(`  #${evidencia.idEvidencia}  ${rutaVieja}  — faltante`);
            return;
        }

        console.log(`  #${evidencia.idEvidencia}  ${rutaVieja}  →  ${relativaNueva}`);

        const hashOrigen = await sha256De(origenAbs);
        if (await esArchivo(destinoAbs)) {
            const hashDestino = await sha256De(destinoAbs);
            if (!hashesIguales(hashDestino, hashOrigen)) {
                totales.conflictos += 1;
                problemas.push({
                    idEvidencia: evidencia.idEvidencia,
                    rutaVieja,
                    motivo: 'El destino ya existe con otro contenido.',
                });
                return;
            }
            totales.yaExistian += 1;
        } else if (dryRun) {
            totales.copiadas += 1;
        } else {
            await mkdir(dirname(destinoAbs), { recursive: true });
            await copyFile(origenAbs, destinoAbs);
            const hashCopia = await sha256De(destinoAbs);
            const esperado = evidencia.hashSha256?.trim() ? evidencia.hashSha256 : hashOrigen;
            if (!hashesIguales(hashCopia, esperado)) {
                await rm(destinoAbs, { force: true });
                totales.errores += 1;
                problemas.push({
                    idEvidencia: evidencia.idEvidencia,
                    rutaVieja,
                    motivo: 'El SHA-256 de la copia no coincide. Se borró la copia.',
                });
                return;
            }
            totales.copiadas += 1;
        }

        const rutaPublica = `/media/${relativaNueva}`;
        if (!dryRun) {
            await prisma.$transaction(async (tx) => {
                await tx.asistenciaEvidencias.update({
                    where: { idEvidencia: evidencia.idEvidencia },
                    data: { rutaArchivo: rutaPublica },
                });
                await tx.registrosAsistencia.updateMany({
                    where: {
                        urlFoto: rutaVieja,
                        OR: [
                            { idEvidencia: evidencia.idEvidencia },
                            { urlFoto: rutaVieja },
                        ],
                    },
                    data: { urlFoto: rutaPublica },
                });
            });
        }
        totales.bdActualizada += 1;
        if (!dryRun && borrarOrigen) {
            await unlink(origenAbs);
        }
    } catch (error) {
        totales.errores += 1;
        const mensaje = error instanceof Error ? error.message : String(error);
        problemas.push({
            idEvidencia: evidencia.idEvidencia,
            rutaVieja,
            motivo: mensaje,
        });
    }
}

async function migrarHuerfanos(
    prisma: PrismaClient,
    origenRaiz: string,
    destinoRaiz: string,
    dryRun: boolean,
    totales: Totales,
    problemas: Problema[],
    procesados: Set<string>,
    slugs: Map<number, string | null>,
    tenantsPorEmpresa: Map<number, number | null>,
) {
    const carpeta = join(origenRaiz, 'attendance');
    const archivos = await listarArchivos(carpeta);
    for (const absoluto of archivos) {
        if (procesados.has(claveArchivo(absoluto))) continue;

        const relativa = relative(origenRaiz, absoluto).replace(/\\/g, '/');
        const idEmpresa = idEmpresaDeRuta(relativa);
        if (idEmpresa == null) {
            totales.huerfanosSinTenant += 1;
            problemas.push({
                idEvidencia: null,
                rutaVieja: relativa,
                motivo: 'Huérfano: no se pudo leer el id de empresa de la ruta.',
            });
            continue;
        }

        const idTenant = await tenantDeEmpresa(prisma, idEmpresa, tenantsPorEmpresa);
        const slug = idTenant != null ? await slugDe(prisma, idTenant, slugs) : null;
        const relativaNueva = slug ? rutaNueva(relativa, slug) : null;
        const destinoAbs = relativaNueva ? unirDentro(destinoRaiz, relativaNueva) : null;

        if (idTenant == null || !slug || !relativaNueva || !destinoAbs) {
            totales.huerfanosSinTenant += 1;
            problemas.push({
                idEvidencia: null,
                rutaVieja: relativa,
                motivo:
                    idTenant == null
                        ? `Huérfano: la empresa ${idEmpresa} no tiene tenant.`
                        : `Huérfano: el tenant ${idTenant ?? '-'} no tiene slug o la ruta no es válida.`,
            });
            continue;
        }

        try {
            if (await esArchivo(destinoAbs)) {
                const igual = hashesIguales(await sha256De(destinoAbs), await sha256De(absoluto));
                if (!igual) {
                    totales.conflictos += 1;
                    problemas.push({
                        idEvidencia: null,
                        rutaVieja: relativa,
                        motivo: 'Huérfano: el destino ya existe con otro contenido.',
                    });
                    console.log(`  huérfano  ${relativa}  — conflicto`);
                    continue;
                }
                totales.yaExistian += 1;
                console.log(`  huérfano  ${relativa}  — ya está en el destino`);
                continue;
            }
            console.log(`  huérfano  ${relativa}  →  ${relativaNueva}`);
            if (!dryRun) {
                await mkdir(dirname(destinoAbs), { recursive: true });
                await copyFile(absoluto, destinoAbs);
                if (!hashesIguales(await sha256De(destinoAbs), await sha256De(absoluto))) {
                    await rm(destinoAbs, { force: true });
                    totales.errores += 1;
                    problemas.push({
                        idEvidencia: null,
                        rutaVieja: relativa,
                        motivo: 'Huérfano: el SHA-256 de la copia no coincide. Se borró la copia.',
                    });
                    continue;
                }
            }
            totales.huerfanosCopiados += 1;
        } catch (error) {
            totales.errores += 1;
            problemas.push({
                idEvidencia: null,
                rutaVieja: relativa,
                motivo: error instanceof Error ? error.message : String(error),
            });
        }
    }
}

async function tenantDeEmpresa(
    prisma: PrismaClient,
    idEmpresa: number,
    cache: Map<number, number | null>,
): Promise<number | null> {
    if (cache.has(idEmpresa)) return cache.get(idEmpresa) ?? null;
    const empresa = await prisma.catEmpresas.findUnique({
        where: { idEmpresa },
        select: { idTenant: true },
    });
    const idTenant = empresa?.idTenant ?? null;
    cache.set(idEmpresa, idTenant);
    return idTenant;
}

main().catch((error: unknown) => {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error(mensaje);
    process.exitCode = 1;
});
