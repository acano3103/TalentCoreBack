/**
 * Revisa caminos de carrera cuyo tipo guardado no coincide con los niveles.
 * Por defecto solo informa. No escribe si no hay bandera.
 *
 *   npm run revisar:caminos-carrera
 *   npm run revisar:caminos-carrera -- --corregir-tipo
 *   npm run revisar:caminos-carrera -- --desactivar-menores
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import { PlanCarreraEstatus, PrismaClient } from '../generated/prisma/client';
import { tipoDeNiveles } from '../src/modules/career-plan/career-plan.niveles';

export type TipoGuardado = 'ascenso' | 'lateral';
export type TipoReal = 'ascenso' | 'lateral' | 'menor';

export interface OpcionesRevision {
    corregirTipo: boolean;
    desactivarMenores: boolean;
}

export interface CaminoFila {
    idRuta: number;
    idEmpresa: number;
    idPuestoOrigen: number;
    idPuestoDestino: number;
    tipo: TipoGuardado;
}

export interface PuestoNivel {
    idPuesto: number;
    nombre: string | null;
    nivel: number | null;
}

export interface CaminoInconsistente {
    idRuta: number;
    idEmpresa: number;
    nombreEmpresa: string;
    origen: string;
    destino: string;
    nivelOrigen: number;
    nivelDestino: number;
    tipoGuardado: TipoGuardado;
    tipoReal: TipoReal;
    planesActivos: number;
}

export interface InformeCaminos {
    inconsistentes: CaminoInconsistente[];
    aLateral: CaminoInconsistente[];
    menoresSinPlanes: CaminoInconsistente[];
    menoresConPlanes: CaminoInconsistente[];
}

export interface CaminosCarreraStore {
    listarCaminosActivos(): Promise<CaminoFila[]>;
    listarPuestos(ids: readonly number[]): Promise<PuestoNivel[]>;
    listarEmpresas(ids: readonly number[]): Promise<{ idEmpresa: number; nombre: string }[]>;
    contarPlanesActivos(idsRuta: readonly number[]): Promise<Map<number, number>>;
    marcarLateral(idRuta: number): Promise<void>;
    desactivar(idRuta: number): Promise<void>;
}

const CERRADOS = [PlanCarreraEstatus.promovido, PlanCarreraEstatus.cancelado];

export function leerOpciones(argv: readonly string[]): OpcionesRevision {
    return {
        corregirTipo: argv.includes('--corregir-tipo'),
        desactivarMenores: argv.includes('--desactivar-menores'),
    };
}

function nombrePuesto(puesto: PuestoNivel | undefined, id: number): string {
    const nombre = puesto?.nombre?.trim();
    return nombre || `Puesto ${id}`;
}

export function clasificarCaminos(
    caminos: readonly CaminoFila[],
    puestos: ReadonlyMap<number, PuestoNivel>,
    empresas: ReadonlyMap<number, string>,
    planes: ReadonlyMap<number, number>,
): CaminoInconsistente[] {
    const inconsistentes: CaminoInconsistente[] = [];
    for (const camino of caminos) {
        const origen = puestos.get(camino.idPuestoOrigen);
        const destino = puestos.get(camino.idPuestoDestino);
        if (origen?.nivel == null || destino?.nivel == null) continue;
        const tipoReal = tipoDeNiveles(origen.nivel, destino.nivel);
        if (tipoReal === camino.tipo) continue;
        inconsistentes.push({
            idRuta: camino.idRuta,
            idEmpresa: camino.idEmpresa,
            nombreEmpresa: empresas.get(camino.idEmpresa) || `Empresa ${camino.idEmpresa}`,
            origen: nombrePuesto(origen, camino.idPuestoOrigen),
            destino: nombrePuesto(destino, camino.idPuestoDestino),
            nivelOrigen: origen.nivel,
            nivelDestino: destino.nivel,
            tipoGuardado: camino.tipo,
            tipoReal,
            planesActivos: planes.get(camino.idRuta) ?? 0,
        });
    }
    return inconsistentes.sort(
        (a, b) => a.idEmpresa - b.idEmpresa || a.idRuta - b.idRuta,
    );
}

export function armarInforme(inconsistentes: readonly CaminoInconsistente[]): InformeCaminos {
    const aLateral = inconsistentes.filter((camino) => camino.tipoReal === 'lateral');
    const menores = inconsistentes.filter((camino) => camino.tipoReal === 'menor');
    return {
        inconsistentes: [...inconsistentes],
        aLateral,
        menoresSinPlanes: menores.filter((camino) => camino.planesActivos === 0),
        menoresConPlanes: menores.filter((camino) => camino.planesActivos > 0),
    };
}

export function textoRevision(informe: InformeCaminos, opciones: OpcionesRevision): string {
    const lineas: string[] = [];
    const porEmpresa = new Map<number, CaminoInconsistente[]>();
    for (const camino of informe.inconsistentes) {
        const lista = porEmpresa.get(camino.idEmpresa) ?? [];
        lista.push(camino);
        porEmpresa.set(camino.idEmpresa, lista);
    }
    if (porEmpresa.size === 0) {
        lineas.push('No hay caminos con el tipo guardado distinto del nivel.');
    }
    for (const [idEmpresa, lista] of porEmpresa) {
        lineas.push(`Empresa ${lista[0].nombreEmpresa} (${idEmpresa})`);
        for (const camino of lista) {
            lineas.push(
                `  ${camino.origen} → ${camino.destino} | niveles ${camino.nivelOrigen} → ${camino.nivelDestino} | guardado ${camino.tipoGuardado} | real ${camino.tipoReal} | planes activos: ${camino.planesActivos}`,
            );
        }
    }
    lineas.push('');
    lineas.push(
        `--corregir-tipo actualizaría ${informe.aLateral.length} camino(s) a lateral.${opciones.corregirTipo ? ' Aplicado.' : ''}`,
    );
    lineas.push(
        `--desactivar-menores desactivaría ${informe.menoresSinPlanes.length} camino(s) menor sin planes activos.${opciones.desactivarMenores ? ' Aplicado.' : ''}`,
    );
    if (informe.menoresConPlanes.length > 0) {
        lineas.push('Caminos menor con planes activos (solo se listan):');
        for (const camino of informe.menoresConPlanes) {
            lineas.push(
                `  ${camino.nombreEmpresa}: ${camino.origen} → ${camino.destino} | planes activos: ${camino.planesActivos}`,
            );
        }
    }
    if (!opciones.corregirTipo && !opciones.desactivarMenores) {
        lineas.push('Sin banderas no se escribió nada.');
    }
    return lineas.join('\n');
}

export async function revisarCaminos(
    store: CaminosCarreraStore,
    opciones: OpcionesRevision,
): Promise<string> {
    const caminos = await store.listarCaminosActivos();
    const idsPuesto = [
        ...new Set(caminos.flatMap((camino) => [camino.idPuestoOrigen, camino.idPuestoDestino])),
    ];
    const idsEmpresa = [...new Set(caminos.map((camino) => camino.idEmpresa))];
    const idsRuta = caminos.map((camino) => camino.idRuta);
    const [puestos, empresas, planes] = await Promise.all([
        store.listarPuestos(idsPuesto),
        store.listarEmpresas(idsEmpresa),
        store.contarPlanesActivos(idsRuta),
    ]);
    const informe = armarInforme(
        clasificarCaminos(
            caminos,
            new Map(puestos.map((puesto) => [puesto.idPuesto, puesto])),
            new Map(empresas.map((empresa) => [empresa.idEmpresa, empresa.nombre])),
            planes,
        ),
    );
    if (opciones.corregirTipo) {
        for (const camino of informe.aLateral) {
            await store.marcarLateral(camino.idRuta);
        }
    }
    if (opciones.desactivarMenores) {
        for (const camino of informe.menoresSinPlanes) {
            await store.desactivar(camino.idRuta);
        }
    }
    return textoRevision(informe, opciones);
}

export function storeDePrisma(prisma: PrismaClient): CaminosCarreraStore {
    return {
        async listarCaminosActivos() {
            const filas = await prisma.relPuestoRuta.findMany({
                where: { activo: { not: false } },
                select: {
                    idRuta: true,
                    idEmpresa: true,
                    idPuestoOrigen: true,
                    idPuestoDestino: true,
                    tipo: true,
                },
                orderBy: [{ idEmpresa: 'asc' }, { idRuta: 'asc' }],
            });
            return filas.map((fila) => ({
                idRuta: fila.idRuta,
                idEmpresa: fila.idEmpresa,
                idPuestoOrigen: fila.idPuestoOrigen,
                idPuestoDestino: fila.idPuestoDestino,
                tipo: fila.tipo,
            }));
        },
        async listarPuestos(ids) {
            if (ids.length === 0) return [];
            const filas = await prisma.catPuestos.findMany({
                where: { idPuesto: { in: [...ids] } },
                select: { idPuesto: true, NombrePuesto: true, IdNivelSalario: true },
            });
            return filas.map((fila) => ({
                idPuesto: fila.idPuesto,
                nombre: fila.NombrePuesto,
                nivel: fila.IdNivelSalario,
            }));
        },
        async listarEmpresas(ids) {
            if (ids.length === 0) return [];
            const filas = await prisma.catEmpresas.findMany({
                where: { idEmpresa: { in: [...ids] } },
                select: { idEmpresa: true, nombre_comercial: true, razon_social: true },
            });
            return filas.map((fila) => ({
                idEmpresa: fila.idEmpresa,
                nombre: fila.nombre_comercial?.trim() || fila.razon_social?.trim() || `Empresa ${fila.idEmpresa}`,
            }));
        },
        async contarPlanesActivos(idsRuta) {
            const conteo = new Map<number, number>();
            if (idsRuta.length === 0) return conteo;
            const filas = await prisma.planCarreraColaborador.groupBy({
                by: ['idRuta'],
                where: {
                    idRuta: { in: [...idsRuta] },
                    estatus: { notIn: CERRADOS },
                },
                _count: { _all: true },
            });
            for (const fila of filas) conteo.set(fila.idRuta, fila._count._all);
            return conteo;
        },
        async marcarLateral(idRuta) {
            await prisma.relPuestoRuta.update({
                where: { idRuta },
                data: { tipo: 'lateral' },
            });
        },
        async desactivar(idRuta) {
            await prisma.relPuestoRuta.update({
                where: { idRuta },
                data: { activo: false },
            });
        },
    };
}

async function main() {
    dotenv.config();
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        throw new Error('Falta DATABASE_URL. No se pueden revisar los caminos de carrera.');
    }
    const opciones = leerOpciones(process.argv.slice(2));
    const prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl) });
    try {
        const texto = await revisarCaminos(storeDePrisma(prisma), opciones);
        console.log(texto);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((error: unknown) => {
        const mensaje = error instanceof Error ? error.message : 'Error al revisar los caminos de carrera';
        console.error(mensaje);
        process.exit(1);
    });
}
