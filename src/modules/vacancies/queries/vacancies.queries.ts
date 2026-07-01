import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export class VacanciesQueries {

    static async getPaginatedRequisitions(
        prisma: PrismaService,
        companyId: number,
        userId: number,
        roleId: number,
        skip: number,
        limit: number,
        search: string,
    ): Promise<any[]> {

        const managerFilter =
            roleId === 4
                ? Prisma.sql`
                AND (
                    v.idUsuarioCreador = ${userId}
                    OR usuarioJefe.id = ${userId}
                )
            `
                : Prisma.empty;

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

            v.idEmpresa = ${companyId}

            AND v.idEstatusVacante IN (1,2,3,4,6)

            ${managerFilter}

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

        const managerFilter =
            roleId === 4
                ? Prisma.sql`
                    AND (
                        v.idUsuarioCreador = ${userId}
                        OR usuarioJefe.id = ${userId}
                    )
                `
                : Prisma.empty;

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

                v.idEmpresa = ${companyId}

                AND v.idEstatusVacante IN (1,2,3,4,6)

                ${managerFilter}

                ${searchFilter}

        `;

        return Number(result[0].total);
    }

    static async getPublicActiveVacancies(
        prisma: PrismaService,
        companyId: number,
    ): Promise<any[]> {
        return prisma.$queryRaw<any[]>`
      SELECT
        v.idVacante,
        v.SalarioMinimo,
        v.SalarioMaximo,
        v.fechaCreacion,
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
        v.idEmpresa    = ${companyId}
        AND v.idEstatusVacante = 5
      ORDER BY v.fechaCreacion DESC
    `;
    }

}