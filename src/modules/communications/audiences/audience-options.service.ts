import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ContextoAlcance } from '../capabilities/alcance';
import { leerNumero, leerTexto } from '../comms-rows';
import { cteAlcance, filtroAlcance } from './alcance-sql';

export interface OpcionAudiencia {
    id: number;
    nombre: string;
    personas: number;
}

export interface OpcionJefe {
    idEmpleado: number;
    nombre: string;
    personas: number;
}

export interface OpcionesAudiencia {
    empresas: OpcionAudiencia[];
    unidades: OpcionAudiencia[];
    ubicaciones: OpcionAudiencia[];
    areas: OpcionAudiencia[];
    puestos: OpcionAudiencia[];
    etiquetas: OpcionAudiencia[];
    tiposPersonal: OpcionAudiencia[];
    jefes: OpcionJefe[];
    campanas: OpcionAudiencia[];
}

@Injectable()
export class AudienceOptionsService {
    constructor(private readonly prisma: PrismaService) {}

    async listar(scope: ContextoAlcance): Promise<OpcionesAudiencia> {
        const [empresas, unidades, ubicaciones, areas, puestos, etiquetas, tiposPersonal, jefes, campanas] =
            await Promise.all([
                this.grupos(
                    scope,
                    Prisma.sql`e.idEmpresa AS id, emp.nombre_comercial AS nombre, COUNT(*) AS personas`,
                    Prisma.sql`INNER JOIN CatEmpresas emp ON emp.idEmpresa = e.idEmpresa`,
                    Prisma.sql`e.idEmpresa IS NOT NULL`,
                    Prisma.sql`e.idEmpresa, emp.nombre_comercial`,
                ),
                this.grupos(
                    scope,
                    Prisma.sql`uo.idUnidadOperativa AS id, uo.Nombre AS nombre, COUNT(*) AS personas`,
                    Prisma.sql`INNER JOIN CatUnidadesOperativas uo ON uo.idUnidadOperativa = s.idUnidadOperativa AND (uo.Activo = 1 OR uo.Activo IS NULL)`,
                    Prisma.sql`s.idUnidadOperativa IS NOT NULL`,
                    Prisma.sql`uo.idUnidadOperativa, uo.Nombre`,
                ),
                this.grupos(
                    scope,
                    Prisma.sql`site.idSite AS id, site.Descripcion AS nombre, COUNT(*) AS personas`,
                    Prisma.sql`INNER JOIN CatSites site ON site.idSite = e.idSite AND (site.Activo = 1 OR site.Activo IS NULL)`,
                    Prisma.sql`e.idSite IS NOT NULL`,
                    Prisma.sql`site.idSite, site.Descripcion`,
                ),
                this.grupos(
                    scope,
                    Prisma.sql`ar.idArea AS id, ar.Descripcion AS nombre, COUNT(DISTINCT e.idEmpleado) AS personas`,
                    Prisma.sql`INNER JOIN CatAreas ar ON ar.idArea = p.idArea AND (ar.Activo = 1 OR ar.Activo IS NULL)`,
                    Prisma.sql`p.idArea IS NOT NULL`,
                    Prisma.sql`ar.idArea, ar.Descripcion`,
                ),
                this.grupos(
                    scope,
                    Prisma.sql`pu.idPuesto AS id, pu.NombrePuesto AS nombre, COUNT(*) AS personas`,
                    Prisma.sql`INNER JOIN CatPuestos pu ON pu.idPuesto = e.idPuesto AND pu.Activo = 1`,
                    Prisma.sql`e.idPuesto IS NOT NULL`,
                    Prisma.sql`pu.idPuesto, pu.NombrePuesto`,
                ),
                this.grupos(
                    scope,
                    Prisma.sql`et.idEtiqueta AS id, et.Nombre AS nombre, COUNT(DISTINCT e.idEmpleado) AS personas`,
                    Prisma.sql`INNER JOIN RelPuestoEtiqueta rel ON rel.idPuesto = e.idPuesto
                        INNER JOIN CatEtiquetasPuesto et ON et.idEtiqueta = rel.idEtiqueta AND et.Activo = 1 AND et.idTenant = ${scope.idTenant}`,
                    Prisma.sql`e.idPuesto IS NOT NULL`,
                    Prisma.sql`et.idEtiqueta, et.Nombre`,
                ),
                this.grupos(
                    scope,
                    Prisma.sql`tp.idTipoPersonal AS id, tp.Nombre AS nombre, COUNT(*) AS personas`,
                    Prisma.sql`INNER JOIN CatTiposPersonal tp ON tp.idTipoPersonal = COALESCE(e.idTipoPersonalOverride, p.idTipoPersonal) AND tp.Activo = 1 AND tp.idTenant = ${scope.idTenant}`,
                    Prisma.sql`COALESCE(e.idTipoPersonalOverride, p.idTipoPersonal) IS NOT NULL`,
                    Prisma.sql`tp.idTipoPersonal, tp.Nombre`,
                ),
                this.jefes(scope),
                this.grupos(
                    scope,
                    Prisma.sql`ca.\`idCampaña\` AS id, ca.descripcion AS nombre, COUNT(*) AS personas`,
                    Prisma.sql`INNER JOIN \`CatCampaña\` ca ON ca.\`idCampaña\` = e.idCampania AND ca.activo = 1`,
                    Prisma.sql`e.idCampania IS NOT NULL`,
                    Prisma.sql`ca.\`idCampaña\`, ca.descripcion`,
                ),
            ]);

        return { empresas, unidades, ubicaciones, areas, puestos, etiquetas, tiposPersonal, jefes, campanas };
    }

    private async grupos(
        scope: ContextoAlcance,
        select: Prisma.Sql,
        joins: Prisma.Sql,
        extra: Prisma.Sql,
        groupBy: Prisma.Sql,
    ): Promise<OpcionAudiencia[]> {
        const filas = await this.prisma.$queryRaw<{ id: number; nombre: string | null; personas: number }[]>(Prisma.sql`
            ${withAlcance(scope)}
            SELECT ${select}
            FROM Empleados e
            LEFT JOIN CatSites s ON s.idSite = e.idSite
            LEFT JOIN CatPuestos p ON p.idPuesto = e.idPuesto
            ${joins}
            WHERE e.activo = 1
              AND e.idTenant = ${scope.idTenant}
              AND ${filtroAlcance(scope)}
              AND ${extra}
            GROUP BY ${groupBy}
            ORDER BY nombre
        `);
        return filas.map((fila) => ({
            id: leerNumero(fila, 'id'),
            nombre: (leerTexto(fila, 'nombre') ?? '').trim(),
            personas: leerNumero(fila, 'personas'),
        }));
    }

    private async jefes(scope: ContextoAlcance): Promise<OpcionJefe[]> {
        const filas = await this.prisma.$queryRaw<{ idEmpleado: number; nombre: string | null; personas: number }[]>(Prisma.sql`
            ${withAlcance(scope)}
            SELECT jefe.idEmpleado AS idEmpleado,
                   TRIM(CONCAT_WS(' ', jefe.nombre, jefe.primerApellido, jefe.segundoApellido)) AS nombre,
                   COUNT(*) AS personas
            FROM Empleados e
            LEFT JOIN CatSites s ON s.idSite = e.idSite
            INNER JOIN Empleados jefe
                ON jefe.idEmpleado = e.idJefeInmediato
               AND jefe.activo = 1
               AND jefe.idTenant = e.idTenant
            WHERE e.activo = 1
              AND e.idTenant = ${scope.idTenant}
              AND ${filtroAlcance(scope)}
              AND e.idJefeInmediato IS NOT NULL
            GROUP BY jefe.idEmpleado, jefe.nombre, jefe.primerApellido, jefe.segundoApellido
            ORDER BY nombre
        `);
        return filas.map((fila) => ({
            idEmpleado: leerNumero(fila, 'idEmpleado'),
            nombre: (leerTexto(fila, 'nombre') ?? '').trim(),
            personas: leerNumero(fila, 'personas'),
        }));
    }
}

function withAlcance(scope: ContextoAlcance): Prisma.Sql {
    const cte = cteAlcance(scope);
    return cte ? Prisma.sql`WITH RECURSIVE ${cte}` : Prisma.empty;
}
