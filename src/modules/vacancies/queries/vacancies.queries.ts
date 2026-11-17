import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export class VacanciesQueries {


    static async getPaginatedActiveVacancies(
        prisma: PrismaService,
        idTenant: number,
        companyId: number,
        skip: number,
        limit: number,
        search: string,
        recruiterEmployeeId: number | null,
        siteId: number | null,
        areaId: number | null,
        status: string,
    ): Promise<any[]> {
        const searchFilter = search
            ? Prisma.sql`
            AND (
                p.NombrePuesto LIKE ${`%${search}%`}
                OR v.Motivo LIKE ${`%${search}%`}
            )
        `
            : Prisma.empty;

        const recruiterFilter = recruiterEmployeeId
            ? Prisma.sql`AND v.idReclutadorAsignado = ${recruiterEmployeeId}`
            : Prisma.empty;

        const siteFilter = siteId !== null
            ? Prisma.sql`AND v.idSite = ${siteId}`
            : Prisma.empty;

        const areaFilter = areaId !== null
            ? Prisma.sql`AND p.idArea = ${areaId}`
            : Prisma.empty;

        let statusFilter: Prisma.Sql;

        switch (status) {
            case 'CERRADA':
                statusFilter = Prisma.sql`AND v.idEstatusVacante = 7`;
                break;

            case 'CANCELADA':
                statusFilter = Prisma.sql`AND v.idEstatusVacante = 8`;
                break;

            case 'TODAS':
                statusFilter = Prisma.sql`AND v.idEstatusVacante IN (5, 7, 8)`;
                break;

            case 'ACTIVA':
            default:
                statusFilter = Prisma.sql`AND v.idEstatusVacante = 5`;
                break;
        }

        return prisma.$queryRaw<any[]>`
        SELECT
            v.idVacante,
            v.idEstatusVacante,
            v.numeroVacantes,
            v.SalarioMinimo,
            v.SalarioMaximo,
            p.idPuesto,
            p.NombrePuesto,
            p.DescripcionPuesto,
            a.Descripcion AS Area,
            tp.Descripcion AS TipoPuesto,
            tc.Descripcion AS TipoContratacion,
            s.Descripcion AS Site,
            emp.idEmpleado AS idReclutadorAsignado,
            CONCAT(
                emp.nombre,
                ' ',
                emp.primerApellido,
                ' ',
                emp.segundoApellido
            ) AS reclutadorAsignado,
            COALESCE(counts.total_cvs, 0) AS TotalCVs,
            COALESCE(counts.total_aprobados, 0) AS TotalAprobados,
            COALESCE(counts.total_rechazados, 0) AS TotalRechazados
        FROM Vacantes v
        INNER JOIN CatPuestos p
            ON p.idPuesto = v.idPuesto
        LEFT JOIN Empleados emp
            ON emp.idEmpleado = v.idReclutadorAsignado
        LEFT JOIN CatAreas a
            ON a.idArea = p.idArea
        LEFT JOIN CatSites s
            ON s.idSite = v.idSite
        LEFT JOIN CatTipoPuesto tp
            ON tp.idTipoPuesto = p.idTipoPuesto
        LEFT JOIN CatTipoContratacion tc
            ON tc.idTipoContratacion = p.idTipoContratacion
        LEFT JOIN (
            SELECT
                post.idVacante,
                COUNT(post.idPostulacion) AS total_cvs,
                SUM(
                    CASE
                        WHEN perf.score_global >= 8 THEN 1
                        ELSE 0
                    END
                ) AS total_aprobados,
                SUM(
                    CASE
                        WHEN perf.score_global IS NOT NULL
                            AND perf.score_global < 8 THEN 1
                        ELSE 0
                    END
                ) AS total_rechazados
            FROM Postulaciones post
            LEFT JOIN PerfilPostulante perf
                ON post.idPostulacion = perf.idPostulacion
            GROUP BY post.idVacante
        ) counts
            ON counts.idVacante = v.idVacante
        WHERE v.idTenant = ${idTenant}
            AND v.idEmpresa = ${companyId}
            AND p.Activo = 1
            ${statusFilter}
            ${searchFilter}
            ${recruiterFilter}
            ${siteFilter}
            ${areaFilter}
        ORDER BY v.fechaCreacion DESC
        LIMIT ${limit}
        OFFSET ${skip}
    `;
    }

    static async countActiveVacancies(
        prisma: PrismaService,
        idTenant: number,
        companyId: number,
        search: string,
        recruiterEmployeeId: number | null,
        siteId: number | null,
        areaId: number | null,
        status: string,
    ): Promise<number> {
        const searchFilter = search
            ? Prisma.sql`
            AND (
                p.NombrePuesto LIKE ${`%${search}%`}
                OR v.Motivo LIKE ${`%${search}%`}
            )
        `
            : Prisma.empty;

        const recruiterFilter = recruiterEmployeeId
            ? Prisma.sql`AND v.idReclutadorAsignado = ${recruiterEmployeeId}`
            : Prisma.empty;

        const siteFilter = siteId !== null
            ? Prisma.sql`AND v.idSite = ${siteId}`
            : Prisma.empty;

        const areaFilter = areaId !== null
            ? Prisma.sql`AND p.idArea = ${areaId}`
            : Prisma.empty;

        let statusFilter: Prisma.Sql;

        switch (status) {
            case 'CERRADA':
                statusFilter = Prisma.sql`AND v.idEstatusVacante = 7`;
                break;

            case 'CANCELADA':
                statusFilter = Prisma.sql`AND v.idEstatusVacante = 8`;
                break;

            case 'TODAS':
                statusFilter = Prisma.sql`AND v.idEstatusVacante IN (5, 7, 8)`;
                break;

            case 'ACTIVA':
            default:
                statusFilter = Prisma.sql`AND v.idEstatusVacante = 5`;
                break;
        }

        const result = await prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS total
        FROM Vacantes v
        INNER JOIN CatPuestos p
            ON p.idPuesto = v.idPuesto
        WHERE v.idTenant = ${idTenant}
            AND v.idEmpresa = ${companyId}
            AND p.Activo = 1
            ${statusFilter}
            ${searchFilter}
            ${recruiterFilter}
            ${siteFilter}
            ${areaFilter}
    `;

        return Number(result[0]?.total ?? 0);
    }


    static async getVacancyPostulantsSummary(
        prisma: PrismaService,
        companyId: number,
        vacancyId: number
    ) {
        return await prisma.$queryRaw`
            SELECT 
                p.idPostulacion,
                p.nombre,
                p.primerApellido,
                p.segundoApellido,
                pp.estado_proceso,
                pp.score_global,
                pp.indices,
                pp.detalle_por_categoria,
                p.correo,
                p.telefono,
                p.rutaCV,
                p.fechaRegistro,
                c.NombrePuesto,
                v.SalarioMinimo,
                v.SalarioMaximo,
                v.numeroVacantes AS Vacantes,
                m.Descripcion AS Modalidad
            FROM Postulaciones p
            INNER JOIN Vacantes v ON p.idVacante = v.idVacante
            INNER JOIN CatPuestos c ON v.idPuesto = c.idPuesto
            LEFT JOIN CatModalidad m ON c.idModalidad = m.idModalidad
            LEFT JOIN PerfilPostulante pp ON p.idPostulacion = pp.idPostulacion
            WHERE p.idVacante = ${vacancyId}
                AND v.idEmpresa = ${companyId}
            ORDER BY 
                CASE WHEN pp.score_global IS NULL THEN 1 ELSE 0 END, 
                pp.score_global DESC, 
                p.fechaRegistro DESC;
        `;
    }

    // Genera el filtro de visibilidad según el nombre del rol.
    private static buildRoleFilter(
        roleName: string | null,
        userId: number
    ): Prisma.Sql {

        const normalizedRole = roleName?.trim().toLowerCase();

        // RH puede consultar todas las requisiciones de su empresa.
        if (normalizedRole === 'rh') {
            return Prisma.empty;
        }

        // Manager solamente consulta sus requisiciones
        // y aquellas donde es jefe inmediato del creador.
        if (normalizedRole === 'manager') {
            return Prisma.sql`
            AND (
                v.idUsuarioCreador = ${userId}
                OR usuarioJefe.id = ${userId}
            )
        `;
        }

        // Los demás roles conservan el comportamiento actual.
        return Prisma.empty;
    }

    static async getPaginatedRequisitions(
        prisma: PrismaService,
        idTenant: number,
        companyId: number,
        userId: number,
        roleName: string | null,
        skip: number,
        limit: number,
        search: string,
    ): Promise<any[]> {

        const roleFilter = this.buildRoleFilter(roleName, userId);

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
        INNER JOIN CatPuestos p
            ON p.idPuesto = v.idPuesto
        INNER JOIN auth_user u
            ON u.id = v.idUsuarioCreador
        INNER JOIN Empleados e
            ON e.idUsuario = u.uuid
        LEFT JOIN Empleados jefe
            ON jefe.idEmpleado = e.idJefeInmediato
        LEFT JOIN auth_user usuarioJefe
            ON usuarioJefe.uuid = jefe.idUsuario
        LEFT JOIN CatEstatusVacante ce
            ON ce.idEstatusVacante = v.idEstatusVacante
        LEFT JOIN CatTiposPublicacion ctp
            ON ctp.idTipoPublicacion = v.idTipoPublicacion
        WHERE
            v.idTenant = ${idTenant}
            AND v.idEmpresa = ${companyId}
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
        idTenant: number,
        companyId: number,
        userId: number,
        roleName: string | null,
        search: string,
    ): Promise<number> {

        const roleFilter = this.buildRoleFilter(roleName, userId);

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
        INNER JOIN CatPuestos p
            ON p.idPuesto = v.idPuesto
        INNER JOIN auth_user u
            ON u.id = v.idUsuarioCreador
        INNER JOIN Empleados e
            ON e.idUsuario = u.uuid
        LEFT JOIN Empleados jefe
            ON jefe.idEmpleado = e.idJefeInmediato
        LEFT JOIN auth_user usuarioJefe
            ON usuarioJefe.uuid = jefe.idUsuario
        WHERE
            v.idTenant = ${idTenant}
            AND v.idEmpresa = ${companyId}
            AND v.idEstatusVacante IN (1,2,3,4,6)
            ${roleFilter}
            ${searchFilter}
    `;

        return Number(result[0]?.total ?? 0);
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