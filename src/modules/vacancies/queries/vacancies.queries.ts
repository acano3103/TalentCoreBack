import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export class VacanciesQueries {

    // Helper interno para generar el filtro por rol dinámicamente y no duplicar código
    private static buildRoleFilter(roleId: number, userId: number): Prisma.Sql {
        if (roleId === 5) {
            // Filtro estricto para Managers
            return Prisma.sql`
                AND (
                    v.idUsuarioCreador = ${userId}
                    OR usuarioJefe.id = ${userId}
                )
            `;
        }

        if (roleId === 2) {
            // Filtro para Recursos Humanos: Sus requisiciones propias OR Estatus 2 y 6 globales
            return Prisma.sql`
                AND (
                    v.idUsuarioCreador = ${userId}
                    OR usuarioJefe.id = ${userId}
                    OR v.idEstatusVacante IN (2, 6)
                )
            `;
        }

        return Prisma.empty;
    }

    static async getPaginatedRequisitions(
        prisma: PrismaService,
        companyId: number,
        userId: number,
        roleId: number,
        skip: number,
        limit: number,
        search: string,
    ): Promise<any[]> {

        const roleFilter = this.buildRoleFilter(roleId, userId);

        const searchFilter = search
            ? Prisma.sql`
                AND (
                    p.NombrePuesto LIKE ${`%${search}%`}
                    OR v.Motivo LIKE ${`%${search}%`}
                )
            `
            : Prisma.empty;

        return prisma.$queryRaw<any[]>`
            SELECT
                v.*,
                p.NombrePuesto,
                ce.decripcion AS estatusVacante,
                ctp.descripcion AS tipoPublicacion,
                CONCAT(
                    e.nombre,' ',
                    IFNULL(e.primerApellido,''),' ',
                    IFNULL(e.segundoApellido,'')
                ) AS creador
            FROM Vacantes v
            INNER JOIN CatPuestos p ON p.idPuesto = v.idPuesto
            INNER JOIN auth_user u ON u.id = v.idUsuarioCreador
            INNER JOIN Empleados e ON e.idUsuario = u.uuid
            LEFT JOIN Empleados jefe ON jefe.idEmpleado = e.idJefeInmediato
            LEFT JOIN auth_user usuarioJefe ON usuarioJefe.uuid = jefe.idUsuario
            LEFT JOIN CatEstatusVacante ce ON ce.idEstatusVacante = v.idEstatusVacante
            LEFT JOIN CatTiposPublicacion ctp ON ctp.idTipoPublicacion = v.idTipoPublicacion
            WHERE
                v.idEmpresa = ${companyId}
                AND v.idEstatusVacante IN (1,2,3,4,6)
                ${roleFilter}
                ${searchFilter}
            ORDER BY v.fechaCreacion DESC
            LIMIT ${limit}
            OFFSET ${skip}
        `;
    }

    static async countRequisitions(
        prisma: PrismaService,
        companyId: number,
        userId: number,
        roleId: number,
        search: string,
    ): Promise<number> {

        const roleFilter = this.buildRoleFilter(roleId, userId);

        const searchFilter = search
            ? Prisma.sql`
                AND (
                    p.NombrePuesto LIKE ${`%${search}%`}
                    OR v.Motivo LIKE ${`%${search}%`}
                )
            `
            : Prisma.empty;

        const result = await prisma.$queryRaw<{ total: bigint }[]>`
            SELECT
                COUNT(*) AS total
            FROM Vacantes v
            INNER JOIN CatPuestos p ON p.idPuesto = v.idPuesto
            INNER JOIN auth_user u ON u.id = v.idUsuarioCreador
            INNER JOIN Empleados e ON e.idUsuario = u.uuid
            LEFT JOIN Empleados jefe ON jefe.idEmpleado = e.idJefeInmediato
            LEFT JOIN auth_user usuarioJefe ON usuarioJefe.uuid = jefe.idUsuario
            WHERE
                v.idEmpresa = ${companyId}
                AND v.idEstatusVacante IN (1,2,3,4,5,6)
                ${roleFilter}
                ${searchFilter}
        `;

        return Number(result[0].total);
    }

    static async getPublicActiveVacancies(
        prisma: PrismaService,
        companyId: number,
        locationId: number | null,
        areaId: number | null,
        minSalary: number | null,
        maxSalary: number | null,
    ): Promise<any[]> {
        // Condición dinámica para Empresa (Si es 0 o null, no filtra por empresa específica)
        const companyFilter = (companyId && companyId !== 0)
            ? Prisma.sql`AND v.idEmpresa = ${companyId}`
            : Prisma.empty;

        // Condición dinámica para Ubicación
        const locationFilter = (locationId && locationId !== 0)
            ? Prisma.sql`AND v.idSite = ${locationId}`
            : Prisma.empty;

        // Condición dinámica para Área Ocupacional
        const areaFilter = (areaId && areaId !== 0)
            ? Prisma.sql`AND p.idArea = ${areaId}`
            : Prisma.empty;

        // Condición dinámica para Rangos de Salario (multiplicamos por 1000 en el query si tu front manda '35k' como 35)
        // Se asume que el Front manda el número crudo (ej: minSalary: 35, maxSalary: 45) -> se compara contra pesos reales en BD multiplicando por 1000
        const salaryFilter = (minSalary !== null && maxSalary !== null)
            ? Prisma.sql`AND (
          (v.SalarioMinimo >= ${minSalary * 1000} AND v.SalarioMinimo <= ${maxSalary * 1000}) 
          OR 
          (v.SalarioMaximo >= ${minSalary * 1000} AND v.SalarioMaximo <= ${maxSalary * 1000})
          OR
          (v.SalarioMinimo <= ${minSalary * 1000} AND v.SalarioMaximo >= ${maxSalary * 1000})
        )`
            : Prisma.empty;

        // Ejecución segura de la consulta cruda inyectando los bloques construídos
        return prisma.$queryRaw<any[]>`
      SELECT
        v.idVacante,
        v.SalarioMinimo,
        v.SalarioMaximo,
        v.fechaActualizacion as fechaCreacion,
        v.Motivo,
        v.InformacionExtra,
        p.NombrePuesto,
        p.DescripcionPuesto,
        p.DisponibilidadViajar,
        a.Descripcion   AS areaName,
        m.Descripcion   AS modalityName,
        s.Descripcion   AS siteName,
        tc.Descripcion  AS contractTypeName,
        tp.descripcion  AS tipoPublicacionName,
        e.nombre_comercial AS empresaName
      FROM Vacantes v
      INNER JOIN CatPuestos p
        ON p.idPuesto = v.idPuesto
      INNER JOIN CatEmpresas e
        ON e.idEmpresa = v.idEmpresa
      LEFT JOIN CatAreas a
        ON a.idArea = p.idArea
      LEFT JOIN CatModalidad m
        ON m.idModalidad = p.idModalidad
      LEFT JOIN CatSites s
        ON s.idSite = v.idSite
      LEFT JOIN CatTipoContratacion tc
        ON tc.idTipoContratacion = p.idTipoContratacion
      LEFT JOIN CatTiposPublicacion tp
        ON tp.idTipoPublicacion = v.idTipoPublicacion
      WHERE
        v.idEstatusVacante = 5
        ${companyFilter}
        ${locationFilter}
        ${areaFilter}
        ${salaryFilter}
      ORDER BY v.fechaActualizacion DESC
    `;
    }

    static async getPublicActiveVacancyById(
        prisma: PrismaService,
        companyId: number,
        vacancyId: number,
    ): Promise<any | null> {
        // Condición dinámica opcional por empresa si tu lógica lo requiere (ej: multitenant o multi-portal)
        const companyFilter = (companyId && companyId !== 0)
            ? Prisma.sql`AND v.idEmpresa = ${companyId}`
            : Prisma.empty;

        const results = await prisma.$queryRaw<any[]>`
            SELECT
                v.idVacante,
                v.SalarioMinimo,
                v.SalarioMaximo,
                v.fechaActualizacion as fechaCreacion,
                v.Motivo,
                v.InformacionExtra,
                p.NombrePuesto,
                p.DescripcionPuesto,
                p.DisponibilidadViajar,
                a.Descripcion   AS areaName,
                m.Descripcion   AS modalityName,
                s.Descripcion   AS siteName,
                tc.Descripcion  AS contractTypeName,
                tp.descripcion  AS tipoPublicacionName,
                e.idEmpresa as companyId,
                e.nombre_comercial AS empresaName
            FROM Vacantes v
            INNER JOIN CatPuestos p
                ON p.idPuesto = v.idPuesto
            INNER JOIN CatEmpresas e
                ON e.idEmpresa = v.idEmpresa
            LEFT JOIN CatAreas a
                ON a.idArea = p.idArea
            LEFT JOIN CatModalidad m
                ON m.idModalidad = p.idModalidad
            LEFT JOIN CatSites s
                ON s.idSite = v.idSite
            LEFT JOIN CatTipoContratacion tc
                ON tc.idTipoContratacion = p.idTipoContratacion
            LEFT JOIN CatTiposPublicacion tp
                ON tp.idTipoPublicacion = v.idTipoPublicacion
            WHERE
                v.idVacante = ${vacancyId}
                AND v.idEstatusVacante = 5
                ${companyFilter}
            LIMIT 1
        `;

        // Retornamos el primer elemento si existe, de lo contrario null
        return results.length > 0 ? results[0] : null;
    }

}