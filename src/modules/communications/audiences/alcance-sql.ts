import { Prisma } from 'generated/prisma/client';
import { ContextoAlcance, PROFUNDIDAD_ESTRUCTURA } from '../capabilities/alcance';
import { CriteriosAudiencia, CriterioJefe, empresasPermitidas } from './criterios';

/** Misma forma que el CTE de capacidades: descendientes activos, sin el jefe, tope de profundidad. */
export function cteAlcance(scope: ContextoAlcance): Prisma.Sql | null {
    if (scope.alcance !== 'ESTRUCTURA' || scope.idEmpleado == null) return null;
    const id = scope.idEmpleado;
    return Prisma.sql`
        alcance_arbol AS (
            SELECT e.idEmpleado AS idEmpleado, 1 AS nivel
            FROM Empleados e
            WHERE e.idJefeInmediato = ${id}
              AND e.idEmpleado <> ${id}
              AND e.idEmpresa = ${scope.companyId}
              AND e.idTenant = ${scope.idTenant}
              AND e.activo = 1
            UNION ALL
            SELECT sub.idEmpleado, alcance_arbol.nivel + 1
            FROM Empleados sub
            INNER JOIN alcance_arbol ON sub.idJefeInmediato = alcance_arbol.idEmpleado
            WHERE sub.idEmpresa = ${scope.companyId}
              AND sub.idTenant = ${scope.idTenant}
              AND sub.activo = 1
              AND sub.idEmpleado <> ${id}
              AND alcance_arbol.nivel < ${PROFUNDIDAD_ESTRUCTURA}
        )
    `;
}

export function filtroAlcance(scope: ContextoAlcance): Prisma.Sql {
    switch (scope.alcance) {
        case 'TENANT':
            return Prisma.sql`1 = 1`;
        case 'EMPRESAS': {
            const refs = scope.referencias ?? [];
            if (!refs.length) return Prisma.sql`1 = 0`;
            return Prisma.sql`e.idEmpresa IN (${Prisma.join(refs)})`;
        }
        case 'UNIDADES': {
            const refs = scope.referencias ?? [];
            if (!refs.length) return Prisma.sql`1 = 0`;
            return Prisma.sql`s.idUnidadOperativa IN (${Prisma.join(refs)})`;
        }
        case 'UBICACIONES': {
            if (!scope.sitesUsuario.length) return Prisma.sql`1 = 0`;
            return Prisma.sql`e.idEmpresa = ${scope.companyId} AND e.idSite IN (${Prisma.join(scope.sitesUsuario)})`;
        }
        case 'ESTRUCTURA':
            if (scope.idEmpleado == null) return Prisma.sql`1 = 0`;
            return Prisma.sql`e.idEmpresa = ${scope.companyId} AND e.idEmpleado IN (SELECT idEmpleado FROM alcance_arbol)`;
        case 'EQUIPO_DIRECTO':
            if (scope.idEmpleado == null) return Prisma.sql`1 = 0`;
            return Prisma.sql`e.idEmpresa = ${scope.companyId} AND e.idJefeInmediato = ${scope.idEmpleado}`;
        default:
            return Prisma.sql`1 = 0`;
    }
}

export function consultaEmpleadoEnAlcance(idEmpleado: number, scope: ContextoAlcance): Prisma.Sql {
    const cte = cteAlcance(scope);
    const withSql = cte ? Prisma.sql`WITH RECURSIVE ${cte}` : Prisma.empty;
    return Prisma.sql`
        ${withSql}
        SELECT e.idEmpleado AS idEmpleado
        FROM Empleados e
        LEFT JOIN CatSites s ON s.idSite = e.idSite
        WHERE e.idEmpleado = ${idEmpleado}
          AND e.activo = 1
          AND e.idTenant = ${scope.idTenant}
          AND ${filtroAlcance(scope)}
        LIMIT 1
    `;
}

export function consultaAudiencia(criterios: CriteriosAudiencia, scope: ContextoAlcance): Prisma.Sql {
    const ctes = [cteAlcance(scope), cteJefes(criterios.jefes ?? [], scope)].filter(
        (cte): cte is Prisma.Sql => cte != null,
    );
    const withSql = ctes.length ? Prisma.sql`WITH RECURSIVE ${Prisma.join(ctes, ', ')}` : Prisma.empty;
    const base = [
        Prisma.sql`e.activo = 1`,
        Prisma.sql`e.idTenant = ${scope.idTenant}`,
        filtroAlcance(scope),
        ...filtrosCriterio(criterios, scope),
    ];
    if (criterios.excluir?.length) {
        base.push(Prisma.sql`e.idEmpleado NOT IN (${Prisma.join(criterios.excluir)})`);
    }

    const selectBase = Prisma.sql`
        SELECT e.idEmpleado AS idEmpleado
        FROM Empleados e
        LEFT JOIN CatPuestos p ON p.idPuesto = e.idPuesto
        LEFT JOIN CatSites s ON s.idSite = e.idSite
        WHERE ${Prisma.join(base, ' AND ')}
    `;

    if (!criterios.agregarEmpleados?.length) {
        return Prisma.sql`
            ${withSql}
            SELECT idEmpleado FROM (${selectBase}) audiencia
            ORDER BY idEmpleado
        `;
    }

    const alta = [
        Prisma.sql`e.activo = 1`,
        Prisma.sql`e.idTenant = ${scope.idTenant}`,
        filtroAlcance(scope),
        Prisma.sql`e.idEmpleado IN (${Prisma.join(criterios.agregarEmpleados)})`,
    ];
    const selectAlta = Prisma.sql`
        SELECT e.idEmpleado AS idEmpleado
        FROM Empleados e
        LEFT JOIN CatSites s ON s.idSite = e.idSite
        WHERE ${Prisma.join(alta, ' AND ')}
    `;

    return Prisma.sql`
        ${withSql}
        SELECT idEmpleado FROM (
            ${selectBase}
            UNION
            ${selectAlta}
        ) audiencia
        ORDER BY idEmpleado
    `;
}

function filtrosCriterio(criterios: CriteriosAudiencia, scope: ContextoAlcance): Prisma.Sql[] {
    const partes: Prisma.Sql[] = [];
    if (criterios.empresas?.length) partes.push(Prisma.sql`e.idEmpresa IN (${Prisma.join(criterios.empresas)})`);
    if (criterios.unidades?.length) {
        partes.push(Prisma.sql`s.idUnidadOperativa IN (${Prisma.join(criterios.unidades)})`);
    }
    if (criterios.ubicaciones?.length) partes.push(Prisma.sql`e.idSite IN (${Prisma.join(criterios.ubicaciones)})`);
    if (criterios.areas?.length) partes.push(Prisma.sql`p.idArea IN (${Prisma.join(criterios.areas)})`);
    if (criterios.puestos?.length) partes.push(Prisma.sql`e.idPuesto IN (${Prisma.join(criterios.puestos)})`);
    if (criterios.etiquetas?.length) {
        partes.push(Prisma.sql`EXISTS (
            SELECT 1 FROM RelPuestoEtiqueta rpe
            WHERE rpe.idPuesto = e.idPuesto
              AND rpe.idEtiqueta IN (${Prisma.join(criterios.etiquetas)})
        )`);
    }
    if (criterios.tiposPersonal?.length) {
        partes.push(
            Prisma.sql`COALESCE(e.idTipoPersonalOverride, p.idTipoPersonal) IN (${Prisma.join(criterios.tiposPersonal)})`,
        );
    }
    if (criterios.campanas?.length) partes.push(Prisma.sql`e.idCampania IN (${Prisma.join(criterios.campanas)})`);
    const jefes = filtroJefes(criterios.jefes ?? [], scope);
    if (jefes) partes.push(jefes);
    return partes;
}

function cteJefes(jefes: readonly CriterioJefe[], scope: ContextoAlcance): Prisma.Sql | null {
    const raices = unicos(jefes.filter((jefe) => jefe.alcance === 'ESTRUCTURA').map((jefe) => jefe.idEmpleado));
    if (!raices.length) return null;
    return Prisma.sql`
        jefes_arbol AS (
            SELECT e.idEmpleado AS idEmpleado, 1 AS nivel
            FROM Empleados e
            WHERE e.idJefeInmediato IN (${Prisma.join(raices)})
              AND e.idEmpleado NOT IN (${Prisma.join(raices)})
              AND e.idTenant = ${scope.idTenant}
              AND e.activo = 1
              AND ${filtroEmpresa('e', scope)}
            UNION ALL
            SELECT sub.idEmpleado, jefes_arbol.nivel + 1
            FROM Empleados sub
            INNER JOIN jefes_arbol ON sub.idJefeInmediato = jefes_arbol.idEmpleado
            WHERE sub.idTenant = ${scope.idTenant}
              AND sub.activo = 1
              AND sub.idEmpleado NOT IN (${Prisma.join(raices)})
              AND jefes_arbol.nivel < ${PROFUNDIDAD_ESTRUCTURA}
              AND ${filtroEmpresa('sub', scope)}
        )
    `;
}

function filtroJefes(jefes: readonly CriterioJefe[], scope: ContextoAlcance): Prisma.Sql | null {
    if (!jefes.length) return null;
    const directos = unicos(jefes.filter((jefe) => jefe.alcance === 'DIRECTO').map((jefe) => jefe.idEmpleado));
    const hayEstructura = jefes.some((jefe) => jefe.alcance === 'ESTRUCTURA');
    const partes: Prisma.Sql[] = [];
    if (directos.length) partes.push(Prisma.sql`e.idJefeInmediato IN (${Prisma.join(directos)})`);
    if (hayEstructura) partes.push(Prisma.sql`e.idEmpleado IN (SELECT idEmpleado FROM jefes_arbol)`);
    if (!partes.length) return Prisma.sql`1 = 0`;
    const combinado = partes.length === 1 ? partes[0] : Prisma.sql`${partes[0]} OR ${partes[1]}`;
    return Prisma.sql`((${combinado}) AND ${filtroEmpresa('e', scope)})`;
}

function filtroEmpresa(alias: 'e' | 'sub', scope: ContextoAlcance): Prisma.Sql {
    const empresas = empresasPermitidas(scope);
    if (empresas === null) return Prisma.sql`1 = 1`;
    const lista = [...empresas];
    if (!lista.length) return Prisma.sql`1 = 0`;
    if (alias === 'e') return Prisma.sql`e.idEmpresa IN (${Prisma.join(lista)})`;
    return Prisma.sql`sub.idEmpresa IN (${Prisma.join(lista)})`;
}

function unicos(ids: number[]): number[] {
    return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
}
