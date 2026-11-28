/**
 * Alcance mayor = el que abarca más gente.
 * El orden sigue el enum, de la organización completa al equipo directo.
 * Si dos reglas traen la misma capacidad, gana este orden y se unen los tipos.
 */
export const ALCANCES = ['TENANT', 'EMPRESAS', 'UNIDADES', 'UBICACIONES', 'ESTRUCTURA', 'EQUIPO_DIRECTO'] as const;

export type ComAlcanceCodigo = (typeof ALCANCES)[number];

export const CODIGOS_CAPACIDAD = [
    'COM_CREAR',
    'COM_AVISO_OPERATIVO',
    'COM_CRITICO',
    'COM_VER_ANALITICA',
    'MURO_PUBLICAR',
    'MURO_FIJAR',
    'MURO_MODERAR',
    'AUD_GESTIONAR',
    'CFG_RECORDATORIOS',
    'CFG_CELEBRACIONES',
    'CFG_CANALES',
    'CFG_PERMISOS',
] as const;

export type CodigoCapacidad = (typeof CODIGOS_CAPACIDAD)[number];

/** Tope del CTE de jefes. Un ciclo en idJefeInmediato se corta aquí. */
export const PROFUNDIDAD_ESTRUCTURA = 15;

const RANGO_ALCANCE: Record<ComAlcanceCodigo, number> = {
    TENANT: 60,
    EMPRESAS: 50,
    UNIDADES: 40,
    UBICACIONES: 30,
    ESTRUCTURA: 20,
    EQUIPO_DIRECTO: 10,
};

export interface ReglaCapacidad {
    codigo: string;
    alcance: ComAlcanceCodigo;
    referencias: number[] | null;
    tiposPermitidos: string[] | null;
}

export interface CapacidadEfectiva {
    codigo: string;
    alcance: ComAlcanceCodigo;
    referencias: number[] | null;
    tiposPermitidos: string[] | null;
}

export function esAlcance(valor: string): valor is ComAlcanceCodigo {
    return (ALCANCES as readonly string[]).includes(valor);
}

/** `null` en tipos significa «todos los tipos». Un null gana sobre cualquier lista. */
export function fusionarReglas(reglas: readonly ReglaCapacidad[]): CapacidadEfectiva[] {
    const grupos = new Map<string, ReglaCapacidad & { rango: number }>();

    for (const regla of reglas) {
        const rango = RANGO_ALCANCE[regla.alcance];
        const actual = grupos.get(regla.codigo);
        if (!actual) {
            grupos.set(regla.codigo, {
                codigo: regla.codigo,
                alcance: regla.alcance,
                referencias: copiarIds(regla.referencias),
                tiposPermitidos: copiarTipos(regla.tiposPermitidos),
                rango,
            });
            continue;
        }

        actual.tiposPermitidos = unirTipos(actual.tiposPermitidos, regla.tiposPermitidos);
        if (rango > actual.rango) {
            actual.rango = rango;
            actual.alcance = regla.alcance;
            actual.referencias = copiarIds(regla.referencias);
        } else if (rango === actual.rango) {
            actual.referencias = unirIds(actual.referencias, regla.referencias);
        }
    }

    return [...grupos.values()]
        .sort((a, b) => a.codigo.localeCompare(b.codigo))
        .map((grupo) => ({
            codigo: grupo.codigo,
            alcance: grupo.alcance,
            referencias: grupo.referencias,
            tiposPermitidos: grupo.tiposPermitidos,
        }));
}

/**
 * EMPRESAS y UNIDADES guardan ids. El resto sale de la persona
 * (tenant, sitios asignados, jefatura) y no acepta una lista.
 */
export function formaAlcanceInvalida(
    alcance: ComAlcanceCodigo,
    referencias: number[] | null,
): 'faltan' | 'sobran' | null {
    const requiereLista = alcance === 'EMPRESAS' || alcance === 'UNIDADES';
    const hayLista = (referencias?.length ?? 0) > 0;
    if (requiereLista && !hayLista) return 'faltan';
    if (!requiereLista && hayLista) return 'sobran';
    return null;
}

export function leerIds(valor: unknown): number[] | null {
    const lista = comoLista(valor);
    if (!lista) return null;
    const ids = [
        ...new Set(
            lista
                .map((item) => (typeof item === 'string' && /^[1-9]\d*$/.test(item) ? Number(item) : item))
                .filter((item): item is number => typeof item === 'number' && Number.isInteger(item) && item > 0),
        ),
    ].sort((a, b) => a - b);
    return ids.length ? ids : null;
}

/** `null` o un JSON vacío se leen como «sin restricción de tipos». */
export function leerTipos(valor: unknown): string[] | null {
    const lista = comoLista(valor);
    if (!lista) return null;
    const tipos = [
        ...new Set(
            lista
                .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
                .map((item) => item.trim().toUpperCase()),
        ),
    ].sort();
    return tipos.length ? tipos : null;
}

export interface NodoJerarquia {
    idEmpleado: number;
    idJefeInmediato: number | null;
}

/**
 * Descendientes activos del jefe, sin incluirlo.
 * No recorre dos veces el mismo id: un ciclo se detiene además del tope de profundidad.
 */
export function expandirEstructura(
    nodos: readonly NodoJerarquia[],
    idRaiz: number,
    profundidadMaxima: number,
): number[] {
    const hijos = new Map<number, number[]>();
    for (const nodo of nodos) {
        if (nodo.idJefeInmediato == null || nodo.idEmpleado === nodo.idJefeInmediato) continue;
        const lista = hijos.get(nodo.idJefeInmediato) ?? [];
        lista.push(nodo.idEmpleado);
        hijos.set(nodo.idJefeInmediato, lista);
    }

    const vistos = new Set<number>([idRaiz]);
    const resultado: number[] = [];
    let frontera = [idRaiz];

    for (let nivel = 1; nivel <= profundidadMaxima && frontera.length > 0; nivel += 1) {
        const siguiente: number[] = [];
        for (const id of frontera) {
            for (const hijo of hijos.get(id) ?? []) {
                if (vistos.has(hijo)) continue;
                vistos.add(hijo);
                resultado.push(hijo);
                siguiente.push(hijo);
            }
        }
        frontera = siguiente;
    }

    return resultado;
}

export interface EmpleadoAlcance {
    idEmpleado: number;
    idTenant: number;
    idEmpresa: number | null;
    idSite: number | null;
    idJefeInmediato: number | null;
    activo: boolean;
}

export interface ContextoAlcance {
    idTenant: number;
    companyId: number;
    idEmpleado: number | null;
    alcance: ComAlcanceCodigo;
    referencias: number[] | null;
    sitesUsuario: number[];
    unidadPorSite: ReadonlyMap<number, number | null>;
}

/** Misma regla que las consultas del servicio, sobre un lote de prueba. */
export function empleadosAlcanzables(empleados: readonly EmpleadoAlcance[], ctx: ContextoAlcance): number[] {
    const activos = empleados.filter((empleado) => empleado.activo && empleado.idTenant === ctx.idTenant);

    switch (ctx.alcance) {
        case 'TENANT':
            return activos.map((empleado) => empleado.idEmpleado);
        case 'EMPRESAS': {
            const empresas = new Set(ctx.referencias ?? []);
            return activos
                .filter((empleado) => empleado.idEmpresa != null && empresas.has(empleado.idEmpresa))
                .map((empleado) => empleado.idEmpleado);
        }
        case 'UNIDADES': {
            const unidades = new Set(ctx.referencias ?? []);
            return activos
                .filter((empleado) => {
                    if (empleado.idSite == null) return false;
                    const unidad = ctx.unidadPorSite.get(empleado.idSite);
                    return unidad != null && unidades.has(unidad);
                })
                .map((empleado) => empleado.idEmpleado);
        }
        case 'UBICACIONES': {
            const sites = new Set(ctx.sitesUsuario);
            return activos
                .filter(
                    (empleado) =>
                        empleado.idEmpresa === ctx.companyId &&
                        empleado.idSite != null &&
                        sites.has(empleado.idSite),
                )
                .map((empleado) => empleado.idEmpleado);
        }
        case 'ESTRUCTURA': {
            if (ctx.idEmpleado == null) return [];
            const deLaEmpresa = activos.filter((empleado) => empleado.idEmpresa === ctx.companyId);
            return expandirEstructura(deLaEmpresa, ctx.idEmpleado, PROFUNDIDAD_ESTRUCTURA);
        }
        case 'EQUIPO_DIRECTO':
            if (ctx.idEmpleado == null) return [];
            return activos
                .filter(
                    (empleado) =>
                        empleado.idEmpresa === ctx.companyId && empleado.idJefeInmediato === ctx.idEmpleado,
                )
                .map((empleado) => empleado.idEmpleado);
        default:
            return [];
    }
}

function copiarIds(ids: number[] | null): number[] | null {
    if (!ids?.length) return null;
    return [...new Set(ids)].sort((a, b) => a - b);
}

function copiarTipos(tipos: string[] | null): string[] | null {
    if (!tipos?.length) return null;
    return [...new Set(tipos)].sort();
}

function unirIds(a: number[] | null, b: number[] | null): number[] | null {
    return copiarIds([...(a ?? []), ...(b ?? [])]);
}

function unirTipos(a: string[] | null, b: string[] | null): string[] | null {
    if (a === null || b === null) return null;
    return copiarTipos([...a, ...b]);
}

function comoLista(valor: unknown): unknown[] | null {
    if (Array.isArray(valor)) return valor;
    if (typeof valor !== 'string' || !valor.trim()) return null;
    try {
        const parsed: unknown = JSON.parse(valor);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}
