import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export class HeadcountQueries {

    // Obtiene los 10 registros paginados de RelAreasUbicaciones con sus contadores agregados
    static async getPaginatedMatrix(
        prisma: PrismaService,
        companyId: number,
        skip: number,
        limit: number,
        search: string,
        locationId?: number
    ): Promise<any[]> {

        // 2. Usamos Prisma.raw() para que el ORM entienda que es un fragmento de código SQL nativo literal
        const siteFilter = locationId
            ? Prisma.raw(`AND rau.idSite = ${Number(locationId)}`)
            : Prisma.empty; // Helper nativo para no meter nada vacío que rompa

        const searchFilter = search
            ? Prisma.raw(`AND (a.Descripcion LIKE '%${search}%' OR s.Descripcion LIKE '%${search}%')`)
            : Prisma.empty;

        return prisma.$queryRaw<any[]>`
          SELECT 
            rau.idAreaUbicacion,
            rau.idSite,
            s.Descripcion AS siteDescripcion,
            rau.idArea,
            a.Descripcion AS areaDescripcion,
            rau.PresupuestoAsignado,
            -- 1. SUMA TOTAL DE PLAZAS
            IFNULL((
              SELECT SUM(rpu.PlazasAutorizadas)
              FROM CatPuestos p
              LEFT JOIN RelPuestosUbicaciones rpu ON rpu.idPuesto = p.idPuesto AND rpu.idSite = rau.idSite
              WHERE p.idArea = rau.idArea AND p.Activo = 1 AND p.aprobada = 1
            ), 0) AS plazasTotales,
            -- 2. SUMA TOTAL DE OCUPADOS
            IFNULL((
              SELECT COUNT(e.idEmpleado)
              FROM Empleados e
              JOIN CatPuestos p ON p.idPuesto = e.idPuesto
              WHERE p.idArea = rau.idArea AND e.idSite = rau.idSite AND e.activo = 1
            ), 0) AS plazasOcupadas
          FROM RelAreasUbicaciones rau
          JOIN CatSites s ON s.idSite = rau.idSite AND s.idEmpresa = ${companyId}
          JOIN CatAreas a ON a.idArea = rau.idArea AND a.Activo = 1
          WHERE rau.Activo = 1
          ${siteFilter}
          ${searchFilter}
          ORDER BY rau.idAreaUbicacion DESC
          LIMIT ${limit} OFFSET ${skip};
        `;
    }

    // 2. Obtiene el conteo total para la paginación de la tabla principal
    static async countMatrixRecords(
        prisma: PrismaService,
        companyId: number,
        search: string,
        locationId?: number
    ): Promise<number> {
        // Hacemos exactamente lo mismo aquí para blindar el conteo
        const siteFilter = locationId ? Prisma.raw(`AND rau.idSite = ${Number(locationId)}`) : Prisma.empty;
        const searchFilter = search ? Prisma.raw(`AND (a.Descripcion LIKE '%${search}%' OR s.Descripcion LIKE '%${search}%')`) : Prisma.empty;

        const result = await prisma.$queryRaw<[{ total: number }]>`
          SELECT COUNT(*) AS total
          FROM RelAreasUbicaciones rau
          JOIN CatSites s ON s.idSite = rau.idSite AND s.idEmpresa = ${companyId}
          JOIN CatAreas a ON a.idArea = rau.idArea AND a.Activo = 1
          WHERE rau.Activo = 1
          ${siteFilter}
          ${searchFilter}
        `;

        return Number(result[0]?.total || 0);
    }

    // 3. Trae los puestos específicos asociados a un Área y Site con su rango salarial completo
    static async getPuestosPorAreaSite(prisma: PrismaService, idArea: number, idSite: number): Promise<any[]> {
        return prisma.$queryRaw<any[]>`
      SELECT 
        p.idPuesto,
        p.NombrePuesto AS nombrePuesto,
        IFNULL(rpu.PlazasAutorizadas, 0) AS autorizado,
        (SELECT COUNT(*) FROM Empleados emp WHERE emp.idPuesto = p.idPuesto AND emp.idSite = ${idSite} AND emp.activo = 1) AS ocupado,
        -- Traemos el nombre del nivel y los topes del tabulador
        IFNULL(cns.NombreNivel, 'SIN NIVEL') AS nombreNivel,
        IFNULL(cns.SalarioMinimo, 0.00) AS salarioMinimo,
        IFNULL(cns.SalarioMaximo, 0.00) AS salarioMaximo
      FROM CatPuestos p
      LEFT JOIN RelPuestosUbicaciones rpu ON rpu.idPuesto = p.idPuesto AND rpu.idSite = ${idSite}
      LEFT JOIN CatNivelesSalario cns ON cns.IdNivelSalario = p.IdNivelSalario
      WHERE p.idArea = ${idArea} AND p.Activo = 1 AND p.aprobada = 1;
    `;
    }

    // 4. Obtiene el resumen global del presupuesto autorizado
    static async getGlobalSummary(
        prisma: PrismaService,
        companyId: number,
        search: string,
        locationId?: number
    ): Promise<{ totalAutorizado: number }> {
        const siteFilter = locationId ? Prisma.raw(`AND rau.idSite = ${Number(locationId)}`) : Prisma.empty;
        const searchFilter = search ? Prisma.raw(`AND (a.Descripcion LIKE '%${search}%' OR s.Descripcion LIKE '%${search}%')`) : Prisma.empty;

        const result = await prisma.$queryRaw<[{ totalAutorizado: string | number }]>`
      SELECT 
        SUM(rau.PresupuestoAsignado) AS totalAutorizado
      FROM RelAreasUbicaciones rau
      JOIN CatSites s ON s.idSite = rau.idSite AND s.idEmpresa = ${companyId}
      JOIN CatAreas a ON a.idArea = rau.idArea AND a.Activo = 1
      WHERE rau.Activo = 1
      ${siteFilter}
      ${searchFilter}
    `;

        return {
            totalAutorizado: Number(result[0]?.totalAutorizado || 0)
        };
    }
}