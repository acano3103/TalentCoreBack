import {
    ContextoAlcance,
    empleadosAlcanzables,
    EmpleadoAlcance,
    expandirEstructura,
    PROFUNDIDAD_ESTRUCTURA,
} from '../capabilities/alcance';

/**
 * OR dentro de cada lista, AND entre listas no vacías,
 * después se resta `excluir`, se suman `agregarEmpleados`
 * y el resultado se cruza con el alcance. Solo empleados activos del tenant.
 * Sin ninguna lista de filtro y con `agregarEmpleados`, la base es vacía:
 * la audiencia son solo esas personas (menos `excluir`). `{}` sigue siendo todos.
 * La consulta de AudienceResolverService sigue esta misma regla.
 */
export interface CriterioJefe {
    idEmpleado: number;
    alcance: 'DIRECTO' | 'ESTRUCTURA';
}

export interface CriteriosAudiencia {
    empresas?: number[];
    unidades?: number[];
    ubicaciones?: number[];
    areas?: number[];
    puestos?: number[];
    etiquetas?: number[];
    tiposPersonal?: number[];
    campanas?: number[];
    jefes?: CriterioJefe[];
    excluir?: number[];
    agregarEmpleados?: number[];
}

export interface EmpleadoAudiencia {
    idEmpleado: number;
    idTenant: number;
    idEmpresa: number | null;
    idSite: number | null;
    idUnidadOperativa: number | null;
    idArea: number | null;
    idPuesto: number | null;
    etiquetas: number[];
    idTipoPersonal: number | null;
    idCampania: number | null;
    idJefeInmediato: number | null;
    activo: boolean;
}

export interface ResultadoAudiencia {
    ids: number[];
    fueraDeAlcance: number[];
}

export function normalizarCriterios(criterios: CriteriosAudiencia | null | undefined): CriteriosAudiencia {
    const origen = criterios ?? {};
    return {
        empresas: ids(origen.empresas),
        unidades: ids(origen.unidades),
        ubicaciones: ids(origen.ubicaciones),
        areas: ids(origen.areas),
        puestos: ids(origen.puestos),
        etiquetas: ids(origen.etiquetas),
        tiposPersonal: ids(origen.tiposPersonal),
        campanas: ids(origen.campanas),
        jefes: jefes(origen.jefes),
        excluir: ids(origen.excluir),
        agregarEmpleados: ids(origen.agregarEmpleados),
    };
}

/** Empresas, unidades, ubicaciones, áreas, puestos, etiquetas, tipos, campañas o jefes. */
export function hayListasFiltro(criterios: CriteriosAudiencia): boolean {
    return Boolean(
        criterios.empresas?.length ||
            criterios.unidades?.length ||
            criterios.ubicaciones?.length ||
            criterios.areas?.length ||
            criterios.puestos?.length ||
            criterios.etiquetas?.length ||
            criterios.tiposPersonal?.length ||
            criterios.campanas?.length ||
            criterios.jefes?.length,
    );
}

export function criteriosVacios(criterios: CriteriosAudiencia): boolean {
    return (
        !criterios.empresas?.length &&
        !criterios.unidades?.length &&
        !criterios.ubicaciones?.length &&
        !criterios.areas?.length &&
        !criterios.puestos?.length &&
        !criterios.etiquetas?.length &&
        !criterios.tiposPersonal?.length &&
        !criterios.campanas?.length &&
        !criterios.jefes?.length &&
        !criterios.excluir?.length &&
        !criterios.agregarEmpleados?.length
    );
}

/** Ids de catálogo que el alcance no deja nombrar. `null` en empresas de TENANT: no hay tope aquí. */
export function idsFueraDeEstructura(criterios: CriteriosAudiencia, scope: ContextoAlcance): number[] {
    const fuera: number[] = [];
    const empresas = empresasPermitidas(scope);
    if (empresas && criterios.empresas?.length) {
        for (const id of criterios.empresas) {
            if (!empresas.has(id)) fuera.push(id);
        }
    }
    if (scope.alcance === 'UNIDADES' && criterios.unidades?.length) {
        const unidades = new Set(scope.referencias ?? []);
        for (const id of criterios.unidades) {
            if (!unidades.has(id)) fuera.push(id);
        }
    }
    if (scope.alcance === 'UBICACIONES' && criterios.ubicaciones?.length) {
        const sites = new Set(scope.sitesUsuario);
        for (const id of criterios.ubicaciones) {
            if (!sites.has(id)) fuera.push(id);
        }
    }
    return unicos(fuera);
}

export function evaluarCriterios(
    empleados: readonly EmpleadoAudiencia[],
    criterios: CriteriosAudiencia,
    scope: ContextoAlcance,
): ResultadoAudiencia {
    const limpios = normalizarCriterios(criterios);
    const unidadPorSite = new Map<number, number | null>();
    for (const empleado of empleados) {
        if (empleado.idSite != null && !unidadPorSite.has(empleado.idSite)) {
            unidadPorSite.set(empleado.idSite, empleado.idUnidadOperativa);
        }
    }
    const contexto: ContextoAlcance = { ...scope, unidadPorSite };
    const alcanzables = new Set(empleadosAlcanzables(aAlcance(empleados), contexto));
    const equipo = equipoDeJefes(empleados, limpios.jefes ?? [], scope);

    const hayFiltro = hayListasFiltro(limpios);
    const soloPersonas = !hayFiltro && (limpios.agregarEmpleados?.length ?? 0) > 0;

    const excluidos = new Set(limpios.excluir ?? []);
    const ids = new Set<number>();

    if (!soloPersonas) {
        for (const empleado of empleados) {
            if (!alcanzables.has(empleado.idEmpleado)) continue;
            if (hayFiltro && !coincide(empleado, limpios, equipo)) continue;
            if (excluidos.has(empleado.idEmpleado)) continue;
            ids.add(empleado.idEmpleado);
        }
    }

    for (const id of limpios.agregarEmpleados ?? []) {
        if (!alcanzables.has(id)) continue;
        if (soloPersonas && excluidos.has(id)) continue;
        ids.add(id);
    }

    const jefesVisibles = new Set(
        empleados
            .filter((empleado) => empleado.activo && empleado.idTenant === scope.idTenant && empresaVisible(empleado, scope))
            .map((empleado) => empleado.idEmpleado),
    );
    const fueraJefes = (limpios.jefes ?? [])
        .map((jefe) => jefe.idEmpleado)
        .filter((id) => !jefesVisibles.has(id));
    const fueraAgregar = (limpios.agregarEmpleados ?? []).filter((id) => !alcanzables.has(id));

    return {
        ids: unicos([...ids]),
        fueraDeAlcance: unicos([...idsFueraDeEstructura(limpios, scope), ...fueraJefes, ...fueraAgregar]),
    };
}

function coincide(empleado: EmpleadoAudiencia, criterios: CriteriosAudiencia, equipo: Set<number>): boolean {
    if (criterios.empresas?.length && (empleado.idEmpresa == null || !criterios.empresas.includes(empleado.idEmpresa))) {
        return false;
    }
    if (
        criterios.unidades?.length &&
        (empleado.idUnidadOperativa == null || !criterios.unidades.includes(empleado.idUnidadOperativa))
    ) {
        return false;
    }
    if (criterios.ubicaciones?.length && (empleado.idSite == null || !criterios.ubicaciones.includes(empleado.idSite))) {
        return false;
    }
    if (criterios.areas?.length && (empleado.idArea == null || !criterios.areas.includes(empleado.idArea))) {
        return false;
    }
    if (criterios.puestos?.length && (empleado.idPuesto == null || !criterios.puestos.includes(empleado.idPuesto))) {
        return false;
    }
    if (criterios.etiquetas?.length && !empleado.etiquetas.some((id) => criterios.etiquetas?.includes(id))) {
        return false;
    }
    if (
        criterios.tiposPersonal?.length &&
        (empleado.idTipoPersonal == null || !criterios.tiposPersonal.includes(empleado.idTipoPersonal))
    ) {
        return false;
    }
    if (criterios.campanas?.length && (empleado.idCampania == null || !criterios.campanas.includes(empleado.idCampania))) {
        return false;
    }
    if (criterios.jefes?.length && !equipo.has(empleado.idEmpleado)) return false;
    return true;
}

function equipoDeJefes(
    empleados: readonly EmpleadoAudiencia[],
    jefes: readonly CriterioJefe[],
    scope: ContextoAlcance,
): Set<number> {
    const ids = new Set<number>();
    if (!jefes.length) return ids;
    const caminables = empleados.filter(
        (empleado) => empleado.activo && empleado.idTenant === scope.idTenant && empresaVisible(empleado, scope),
    );
    const nodos = caminables.map((empleado) => ({
        idEmpleado: empleado.idEmpleado,
        idJefeInmediato: empleado.idJefeInmediato,
    }));
    for (const jefe of jefes) {
        if (jefe.alcance === 'DIRECTO') {
            for (const empleado of caminables) {
                if (empleado.idJefeInmediato === jefe.idEmpleado && empleado.idEmpleado !== jefe.idEmpleado) {
                    ids.add(empleado.idEmpleado);
                }
            }
            continue;
        }
        for (const id of expandirEstructura(nodos, jefe.idEmpleado, PROFUNDIDAD_ESTRUCTURA)) {
            ids.add(id);
        }
    }
    return ids;
}

function empresaVisible(empleado: EmpleadoAudiencia, scope: ContextoAlcance): boolean {
    if (scope.alcance === 'TENANT') return true;
    const empresas = empresasPermitidas(scope);
    return empleado.idEmpresa != null && !!empresas?.has(empleado.idEmpresa);
}

/** `null` = el tenant completo, sin lista de empresas. */
export function empresasPermitidas(scope: ContextoAlcance): Set<number> | null {
    if (scope.alcance === 'TENANT') return null;
    if (scope.alcance === 'EMPRESAS') return new Set(scope.referencias ?? []);
    return new Set([scope.companyId]);
}

function aAlcance(empleados: readonly EmpleadoAudiencia[]): EmpleadoAlcance[] {
    return empleados.map((empleado) => ({
        idEmpleado: empleado.idEmpleado,
        idTenant: empleado.idTenant,
        idEmpresa: empleado.idEmpresa,
        idSite: empleado.idSite,
        idJefeInmediato: empleado.idJefeInmediato,
        activo: empleado.activo,
    }));
}

function ids(valor: number[] | undefined): number[] | undefined {
    if (!valor?.length) return undefined;
    const limpios = unicos(valor.filter((id) => Number.isInteger(id) && id > 0));
    return limpios.length ? limpios : undefined;
}

function jefes(valor: CriterioJefe[] | undefined): CriterioJefe[] | undefined {
    if (!valor?.length) return undefined;
    const vistos = new Set<string>();
    const limpios: CriterioJefe[] = [];
    for (const jefe of valor) {
        if (!jefe || !Number.isInteger(jefe.idEmpleado) || jefe.idEmpleado <= 0) continue;
        if (jefe.alcance !== 'DIRECTO' && jefe.alcance !== 'ESTRUCTURA') continue;
        const clave = `${jefe.idEmpleado}:${jefe.alcance}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        limpios.push({ idEmpleado: jefe.idEmpleado, alcance: jefe.alcance });
    }
    return limpios.length ? limpios : undefined;
}

export function unicos(idsLista: number[]): number[] {
    return [...new Set(idsLista.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
}
