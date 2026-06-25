import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class OrganizationChartQueries {
    static async getCompanyName(prisma: PrismaService, companyId: number): Promise<string> {
        const result = await prisma.$queryRaw<[{ nombre_comercial: string }]>`
          SELECT nombre_comercial FROM CatEmpresas WHERE idEmpresa = ${companyId} LIMIT 1
        `;
        return result[0]?.nombre_comercial || 'Empresa';
    }

    static async getAuthorizedChartData(
        prisma: PrismaService,
        companyId: number,
        siteId?: number,
        areaId?: number
    ): Promise<any[]> {
        const filterSiteId = siteId ?? null;
        const filterAreaId = areaId ?? null;

        return prisma.$queryRaw<any[]>`
        WITH RECURSIVE seq_generator AS (
            SELECT 1 AS seq
            UNION ALL
            SELECT seq + 1 FROM seq_generator WHERE seq < 50
        ),
        PlazasOcupadas AS (
            SELECT 
                idEmpleado,
                idPuesto,
                idSite,
                ROW_NUMBER() OVER (PARTITION BY idPuesto, idSite ORDER BY idEmpleado) AS rn
            FROM Empleados
            WHERE activo = 1
        )
        SELECT 
            CONCAT(p.idPuesto, '_', rpu.idSite, '_', sg.seq) AS uid,       
            p.idPuesto,
            p.NombrePuesto,
            p.idJefeInmediato, 
            a.idArea,
            a.Descripcion AS Area,
            s.idSite,
            s.Descripcion AS Site,
            CASE 
                WHEN emp.idEmpleado IS NOT NULL THEN 'OCUPADO'
                ELSE 'VACANTE'
            END AS estatus
        FROM CatEmpresas e
        -- Mantenemos las uniones limpias y fijas para evitar errores de sintaxis
        JOIN CatSites s ON s.idEmpresa = e.idEmpresa
        JOIN RelAreasUbicaciones rau ON rau.idSite = s.idSite AND rau.Activo = 1
        JOIN CatAreas a ON a.idArea = rau.idArea AND a.Activo = 1
        JOIN CatPuestos p ON p.idArea = a.idArea AND p.Activo = 1
        JOIN RelPuestosUbicaciones rpu ON rpu.idPuesto = p.idPuesto AND rpu.idSite = s.idSite
        JOIN seq_generator sg ON sg.seq <= GREATEST(1, rpu.PlazasAutorizadas)
        LEFT JOIN PlazasOcupadas emp ON emp.idPuesto = p.idPuesto AND emp.idSite = rpu.idSite AND emp.rn = sg.seq
        -- Evaluamos de forma segura los filtros opcionales en el WHERE
        WHERE e.idEmpresa = ${companyId} 
          AND p.Activo = 1
          AND (${filterSiteId} IS NULL OR s.idSite = ${filterSiteId})
          AND (${filterAreaId} IS NULL OR a.idArea = ${filterAreaId});
    `;
    }

    static async getRealEmployeesData(
        prisma: PrismaService,
        companyId: number,
        siteId: number | null,
        areaId: number | null
    ): Promise<any[]> {
        return prisma.$queryRaw<any[]>`
            SELECT 
                CONCAT('EMP_', e.idEmpleado) AS uid,
                e.idEmpleado,
                CONCAT(e.nombre, ' ', e.primerApellido, ' ', COALESCE(e.segundoApellido, '')) AS nombreCompleto,
                e.idJefeInmediato,
                CASE 
                    WHEN e.idJefeInmediato IS NOT NULL THEN CONCAT('EMP_', e.idJefeInmediato)
                    ELSE NULL 
                END AS parentUid,
                p.idPuesto,
                p.NombrePuesto,
                a.idArea,
                a.Descripcion AS Area,
                s.idSite,
                s.Descripcion AS Site
            FROM Empleados e
            JOIN CatPuestos p ON p.idPuesto = e.idPuesto AND p.Activo = 1
            JOIN CatAreas a ON a.idArea = p.idArea AND a.Activo = 1
            JOIN CatSites s ON s.idSite = e.idSite AND s.idEmpresa = ${companyId}
            WHERE e.activo = 1
              AND (${siteId} IS NULL OR s.idSite = ${siteId})
              AND (${areaId} IS NULL OR p.idArea = ${areaId});
        `;
    }

    static async getRealVacanciesData(
        prisma: PrismaService,
        companyId: number,
        siteId: number | null,
        areaId: number | null
    ): Promise<any[]> {
        return prisma.$queryRaw<any[]>`
            SELECT 
                CONCAT('VAC_', v.idVacante) AS uid,
                v.idVacante,
                CONCAT('EMP_', v.idJefeInmediato) AS parentUid,
                p.idPuesto,
                p.NombrePuesto,
                a.idArea,
                a.Descripcion AS Area,
                s.idSite,
                s.Descripcion AS Site,
                ev.decripcion AS Estatus
            FROM Vacantes v
            JOIN CatPuestos p ON p.idPuesto = v.idPuesto AND p.Activo = 1
            JOIN CatAreas a ON a.idArea = p.idArea AND a.Activo = 1
            JOIN CatSites s ON s.idSite = v.idSite AND s.idEmpresa = ${companyId}
            JOIN CatEstatusVacante ev ON ev.idEstatusVacante = v.idEstatusVacante
            WHERE v.idEstatusVacante = 5
              AND (${siteId} IS NULL OR s.idSite = ${siteId})
              AND (${areaId} IS NULL OR p.idArea = ${areaId});
        `;
    }

}