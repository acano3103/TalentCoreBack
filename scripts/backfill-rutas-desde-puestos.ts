/**
 * Crea rutas de aprendizaje a partir de RelPuestoCurso.
 * Idempotente: si la ruta ya existe por nombre, propósito y puesto, la salta.
 * No asigna personas y no borra RelPuestoCurso.
 *
 *   npm run backfill:rutas-desde-puestos
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import { PrismaClient } from '../generated/prisma/client';

export const USUARIO_BACKFILL = 'backfill';
const TIPO_INGRESO = 1;
const TIPO_PUESTO = 2;
const TIPO_PROMOCION = 3;
const TIPO_OBLIGATORIO = 4;
const NOMBRE_MAX = 200;

export type PropositoRuta = 'puesto' | 'promocion';

export interface PuestoOrigen {
    idPuesto: number;
    idEmpresa: number;
    idTenant: number | null;
    nombre: string;
}

export interface CursoPuesto {
    idPuesto: number;
    idCurso: number;
    idTipoCurso: number | null;
    activo: boolean | null;
}

export interface ElementoPlan {
    idCurso: number;
    orden: number;
    obligatorio: boolean;
}

export interface EtapaPlan {
    nombre: string;
    orden: number;
    diaInicio: number;
    diaFin: number;
    requiereEtapaAnterior: boolean;
    elementos: ElementoPlan[];
}

export interface RutaPlan {
    idEmpresa: number;
    idTenant: number | null;
    nombre: string;
    proposito: PropositoRuta;
    idPuesto: number;
    etapas: EtapaPlan[];
}

export interface RutaGuardada {
    idRutaAprendizaje: number;
    idEmpresa: number;
    nombre: string;
    proposito: PropositoRuta;
    idPuesto: number;
}

export interface CaminoPuesto {
    idRuta: number;
    idEmpresa: number;
    idPuestoDestino: number;
    idRutaAprendizaje: number | null;
}

export interface ResumenBackfillRutas {
    rutasPuestoCreadas: number;
    rutasPromocionCreadas: number;
    rutasOmitidas: number;
    caminosEnlazados: number;
}

export interface BackfillRutasStore {
    listarPuestosConCursosActivos(): Promise<PuestoOrigen[]>;
    listarCursosActivos(idPuestos: readonly number[]): Promise<CursoPuesto[]>;
    listarRutas(idEmpresa: number): Promise<RutaGuardada[]>;
    listarCaminos(idEmpresa: number, idPuestoDestino: number): Promise<CaminoPuesto[]>;
    crearRuta(plan: RutaPlan): Promise<RutaGuardada>;
    enlazarCamino(idRuta: number, idRutaAprendizaje: number): Promise<void>;
}

function recortar(valor: string): string {
    return valor.length <= NOMBRE_MAX ? valor : valor.slice(0, NOMBRE_MAX);
}

export function nombreRutaPuesto(nombrePuesto: string): string {
    return recortar(nombrePuesto);
}

export function nombreRutaPromocion(nombrePuesto: string): string {
    return recortar(`Promoción a ${nombrePuesto}`);
}

function cursosDelPuesto(puesto: PuestoOrigen, cursos: readonly CursoPuesto[]): Map<number, Set<number>> {
    const porCurso = new Map<number, Set<number>>();
    for (const curso of cursos) {
        if (curso.idPuesto !== puesto.idPuesto || curso.activo === false || curso.idTipoCurso == null) continue;
        const tipos = porCurso.get(curso.idCurso) ?? new Set<number>();
        tipos.add(curso.idTipoCurso);
        porCurso.set(curso.idCurso, tipos);
    }
    return porCurso;
}

function elementosDe(ids: readonly number[], obligatorio: (idCurso: number) => boolean): ElementoPlan[] {
    return ids.map((idCurso, indice) => ({
        idCurso,
        orden: indice + 1,
        obligatorio: obligatorio(idCurso),
    }));
}

/**
 * Arma la ruta de puesto (tipos 1, 2 y 4) y, si hay tipo 3, la de promoción.
 * Un curso que está en ingreso no se repite en la etapa de puesto.
 * El tipo 4 queda obligatorio. El tipo 2 también: forma parte de la malla del puesto.
 */
export function planificarPuesto(puesto: PuestoOrigen, cursos: readonly CursoPuesto[]): RutaPlan[] {
    const nombre = puesto.nombre.trim() || `Puesto ${puesto.idPuesto}`;
    const porCurso = cursosDelPuesto(puesto, cursos);
    const ids = [...porCurso.keys()].sort((a, b) => a - b);

    const ingreso: number[] = [];
    const dePuesto: number[] = [];
    const promocion: number[] = [];
    for (const idCurso of ids) {
        const tipos = porCurso.get(idCurso)!;
        if (tipos.has(TIPO_PROMOCION)) promocion.push(idCurso);
        if (tipos.has(TIPO_INGRESO)) {
            ingreso.push(idCurso);
            continue;
        }
        if (tipos.has(TIPO_PUESTO) || tipos.has(TIPO_OBLIGATORIO)) dePuesto.push(idCurso);
    }

    const planes: RutaPlan[] = [];
    const etapas: EtapaPlan[] = [];
    if (ingreso.length > 0) {
        etapas.push({
            nombre: 'Ingreso',
            orden: 1,
            diaInicio: 0,
            diaFin: 30,
            requiereEtapaAnterior: false,
            elementos: elementosDe(ingreso, () => true),
        });
    }
    if (dePuesto.length > 0) {
        etapas.push({
            nombre: 'Puesto',
            orden: etapas.length + 1,
            diaInicio: 0,
            diaFin: 90,
            requiereEtapaAnterior: ingreso.length > 0,
            elementos: elementosDe(dePuesto, (idCurso) => {
                const tipos = porCurso.get(idCurso)!;
                return tipos.has(TIPO_PUESTO) || tipos.has(TIPO_OBLIGATORIO);
            }),
        });
    }
    if (etapas.length > 0) {
        planes.push({
            idEmpresa: puesto.idEmpresa,
            idTenant: puesto.idTenant,
            nombre: nombreRutaPuesto(nombre),
            proposito: 'puesto',
            idPuesto: puesto.idPuesto,
            etapas,
        });
    }
    if (promocion.length > 0) {
        planes.push({
            idEmpresa: puesto.idEmpresa,
            idTenant: puesto.idTenant,
            nombre: nombreRutaPromocion(nombre),
            proposito: 'promocion',
            idPuesto: puesto.idPuesto,
            etapas: [
                {
                    nombre: 'Promoción',
                    orden: 1,
                    diaInicio: 0,
                    diaFin: 90,
                    requiereEtapaAnterior: false,
                    elementos: elementosDe(promocion, () => true),
                },
            ],
        });
    }
    return planes;
}

function yaExiste(rutas: readonly RutaGuardada[], plan: RutaPlan): RutaGuardada | undefined {
    return rutas.find(
        (ruta) =>
            ruta.idEmpresa === plan.idEmpresa &&
            ruta.nombre === plan.nombre &&
            ruta.proposito === plan.proposito &&
            ruta.idPuesto === plan.idPuesto,
    );
}

export async function aplicarBackfill(store: BackfillRutasStore): Promise<ResumenBackfillRutas> {
    const puestos = await store.listarPuestosConCursosActivos();
    const cursos = await store.listarCursosActivos(puestos.map((puesto) => puesto.idPuesto));
    const resumen: ResumenBackfillRutas = {
        rutasPuestoCreadas: 0,
        rutasPromocionCreadas: 0,
        rutasOmitidas: 0,
        caminosEnlazados: 0,
    };
    const cache = new Map<number, RutaGuardada[]>();

    for (const puesto of puestos) {
        if (!cache.has(puesto.idEmpresa)) {
            cache.set(puesto.idEmpresa, await store.listarRutas(puesto.idEmpresa));
        }
        const existentes = cache.get(puesto.idEmpresa)!;
        for (const plan of planificarPuesto(puesto, cursos)) {
            const previa = yaExiste(existentes, plan);
            const idRutaAprendizaje = previa
                ? previa.idRutaAprendizaje
                : (await store.crearRuta(plan)).idRutaAprendizaje;
            if (previa) {
                resumen.rutasOmitidas += 1;
            } else {
                existentes.push({
                    idRutaAprendizaje,
                    idEmpresa: plan.idEmpresa,
                    nombre: plan.nombre,
                    proposito: plan.proposito,
                    idPuesto: plan.idPuesto,
                });
                if (plan.proposito === 'puesto') resumen.rutasPuestoCreadas += 1;
                else resumen.rutasPromocionCreadas += 1;
            }
            if (plan.proposito !== 'promocion') continue;
            const caminos = await store.listarCaminos(plan.idEmpresa, plan.idPuesto);
            for (const camino of caminos) {
                if (camino.idRutaAprendizaje != null) continue;
                await store.enlazarCamino(camino.idRuta, idRutaAprendizaje);
                resumen.caminosEnlazados += 1;
            }
        }
    }
    return resumen;
}

export function storeDePrisma(prisma: PrismaClient): BackfillRutasStore {
    return {
        async listarPuestosConCursosActivos() {
            const relaciones = await prisma.relPuestoCurso.findMany({
                where: { activo: { not: false } },
                select: { idPuesto: true },
                distinct: ['idPuesto'],
            });
            if (relaciones.length === 0) return [];
            const puestos = await prisma.catPuestos.findMany({
                where: { idPuesto: { in: relaciones.map((relacion) => relacion.idPuesto) } },
                select: { idPuesto: true, idEmpresa: true, idTenant: true, NombrePuesto: true },
            });
            return puestos.map((puesto) => ({
                idPuesto: puesto.idPuesto,
                idEmpresa: puesto.idEmpresa,
                idTenant: puesto.idTenant,
                nombre: puesto.NombrePuesto,
            }));
        },
        async listarCursosActivos(idPuestos) {
            if (idPuestos.length === 0) return [];
            return prisma.relPuestoCurso.findMany({
                where: { idPuesto: { in: [...idPuestos] }, activo: { not: false } },
                select: { idPuesto: true, idCurso: true, idTipoCurso: true, activo: true },
            });
        },
        async listarRutas(idEmpresa) {
            const rutas = await prisma.rutaAprendizaje.findMany({
                where: { idEmpresa },
                select: {
                    idRutaAprendizaje: true,
                    idEmpresa: true,
                    nombre: true,
                    proposito: true,
                    RutaVersiones: { select: { RutaAlcances: { select: { idPuesto: true } } } },
                },
            });
            const guardadas: RutaGuardada[] = [];
            for (const ruta of rutas) {
                if (ruta.proposito !== 'puesto' && ruta.proposito !== 'promocion') continue;
                const puestos = new Set<number>();
                for (const version of ruta.RutaVersiones) {
                    for (const alcance of version.RutaAlcances) {
                        if (alcance.idPuesto != null) puestos.add(alcance.idPuesto);
                    }
                }
                for (const idPuesto of puestos) {
                    guardadas.push({
                        idRutaAprendizaje: ruta.idRutaAprendizaje,
                        idEmpresa: ruta.idEmpresa,
                        nombre: ruta.nombre,
                        proposito: ruta.proposito,
                        idPuesto,
                    });
                }
            }
            return guardadas;
        },
        listarCaminos(idEmpresa, idPuestoDestino) {
            return prisma.relPuestoRuta.findMany({
                where: { idEmpresa, idPuestoDestino },
                select: { idRuta: true, idEmpresa: true, idPuestoDestino: true, idRutaAprendizaje: true },
            });
        },
        async crearRuta(plan) {
            const idRutaAprendizaje = await prisma.$transaction(async (tx) => {
                const ruta = await tx.rutaAprendizaje.create({
                    data: {
                        idTenant: plan.idTenant,
                        idEmpresa: plan.idEmpresa,
                        nombre: plan.nombre,
                        proposito: plan.proposito,
                        activo: true,
                        usuarioRegistro: USUARIO_BACKFILL,
                    },
                });
                const version = await tx.rutaVersion.create({
                    data: {
                        idRutaAprendizaje: ruta.idRutaAprendizaje,
                        numero: 1,
                        estado: 'publicada',
                        publicadaEn: new Date(),
                    },
                });
                for (const etapa of plan.etapas) {
                    const creada = await tx.rutaEtapa.create({
                        data: {
                            idVersion: version.idVersion,
                            nombre: etapa.nombre,
                            orden: etapa.orden,
                            diaInicio: etapa.diaInicio,
                            diaFin: etapa.diaFin,
                            requiereEtapaAnterior: etapa.requiereEtapaAnterior,
                        },
                    });
                    if (etapa.elementos.length === 0) continue;
                    await tx.rutaElemento.createMany({
                        data: etapa.elementos.map((elemento) => ({
                            idEtapa: creada.idEtapa,
                            idVersion: version.idVersion,
                            idCurso: elemento.idCurso,
                            orden: elemento.orden,
                            obligatorio: elemento.obligatorio,
                        })),
                    });
                }
                await tx.rutaAlcance.create({
                    data: { idVersion: version.idVersion, modo: 'incluir', idPuesto: plan.idPuesto },
                });
                return ruta.idRutaAprendizaje;
            });
            return {
                idRutaAprendizaje,
                idEmpresa: plan.idEmpresa,
                nombre: plan.nombre,
                proposito: plan.proposito,
                idPuesto: plan.idPuesto,
            };
        },
        async enlazarCamino(idRuta, idRutaAprendizaje) {
            await prisma.relPuestoRuta.update({
                where: { idRuta },
                data: { idRutaAprendizaje },
            });
        },
    };
}

function imprimirResumen(resumen: ResumenBackfillRutas) {
    console.log(
        `Backfill de rutas listo. Puesto: ${resumen.rutasPuestoCreadas}. Promoción: ${resumen.rutasPromocionCreadas}. Omitidas: ${resumen.rutasOmitidas}. Caminos enlazados: ${resumen.caminosEnlazados}.`,
    );
}

async function main() {
    dotenv.config();
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        throw new Error('Falta DATABASE_URL. No se pueden crear las rutas desde los puestos.');
    }
    const prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl) });
    try {
        imprimirResumen(await aplicarBackfill(storeDePrisma(prisma)));
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((error: unknown) => {
        const mensaje = error instanceof Error ? error.message : 'Error al crear las rutas desde los puestos';
        console.error(mensaje);
        process.exit(1);
    });
}
