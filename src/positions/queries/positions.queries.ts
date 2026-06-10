import { PrismaService } from 'src/prisma/prisma.service';

export class PositionQueries {
  static async getPositionInfo(prisma: PrismaService, positionId: number) {
    const result = await prisma.$queryRaw<any[]>`
            SELECT 
                p.NombrePuesto AS positionName, 
                u.email,
                u.phone,
                u.uuid AS userUuid, 
                CONCAT(u.first_name, ' ', u.last_name) AS name
            FROM CatPuestos p
            JOIN auth_user u ON u.username = p.UsuarioRegistro
            WHERE p.idPuesto = ${positionId}
            LIMIT 1
        `;
    return result[0] ?? null;
  }

  static async approvePosition(prisma: PrismaService, positionId: number, comment: string) {
    await prisma.$executeRaw`
            UPDATE CatPuestos
            SET aprobada = 1,
                Activo = 1,
                comentarios = ${comment}
            WHERE idPuesto = ${positionId}
        `;
  }

  static async rejectPosition(prisma: PrismaService, positionId: number, comment: string) {
    await prisma.$executeRaw`
            UPDATE CatPuestos
            SET aprobada = 0,
                pendiente = 0,
                comentarios = ${comment}
            WHERE idPuesto = ${positionId}
        `;
  }

  static async getPostulantsSummary(prisma: PrismaService, idPuesto: number) {
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
        c.SalarioMinimo,
        c.SalarioMaximo,
        c.Vacantes,
        m.Descripcion AS Modalidad
      FROM Postulaciones p
      INNER JOIN CatPuestos c ON p.idPuesto = c.idPuesto
      LEFT JOIN CatModalidad m ON c.idModalidad = m.idModalidad
      LEFT JOIN PerfilPostulante pp ON p.idPostulacion = pp.idPostulacion
      WHERE p.idPuesto = ${idPuesto}
      AND pp.score_global IS NOT NULL
      ORDER BY pp.score_global DESC;
    `;
  }

  static async getActivePositions(prisma: PrismaService, companyId: number) {
    return await prisma.$queryRaw`
      SELECT 
        p.idPuesto,
        p.NombrePuesto,
        p.DescripcionPuesto,
        p.SalarioMinimo,
        p.SalarioMaximo,
        p.Vacantes,
        p.Edad,
        a.Descripcion AS Area,
        tp.Descripcion AS TipoPuesto,
        tc.Descripcion AS TipoContratacion,
        m.Descripcion AS Modalidad,
        e.Descripcion AS Escolaridad,
        s.Descripcion AS Site,
        
        COALESCE(counts.total_cvs, 0) AS TotalCVs,
        COALESCE(counts.total_aprobados, 0) AS TotalAprobados,
        COALESCE(counts.total_rechazados, 0) AS TotalRechazados
      FROM CatPuestos p
      INNER JOIN CatAreas a ON a.idArea = p.idArea
      INNER JOIN CatSites s ON s.idSite = a.idSite
      INNER JOIN CatEmpresas ce ON ce.idEmpresa = s.idEmpresa
      LEFT JOIN CatTipoPuesto tp ON tp.idTipoPuesto = p.idTipoPuesto
      LEFT JOIN CatTipoContratacion tc ON tc.idTipoContratacion = p.idTipoContratacion
      LEFT JOIN CatModalidad m ON m.idModalidad = p.idModalidad
      LEFT JOIN CatEscolaridad e ON e.idNivelEstudios = p.idNivelEstudios

      -- Subquery óptimo para agrupar postulaciones por puesto
      LEFT JOIN (
        SELECT 
          post.idPuesto,
          COUNT(post.idPostulacion) AS total_cvs,
          -- Contamos como aprobados los que tengan score mayor o igual a 8
          SUM(CASE WHEN perf.score_global >= 8 THEN 1 ELSE 0 END) AS total_aprobados,
          -- Contamos como rechazados los que tengan score menor a 8 o estén explícitamente descartados
          SUM(CASE WHEN perf.score_global < 8 OR perf.score_global IS NULL THEN 1 ELSE 0 END) AS total_rechazados
        FROM Postulaciones post
        LEFT JOIN PerfilPostulante perf ON post.idPostulacion = perf.idPostulacion
        GROUP BY post.idPuesto
      ) counts ON counts.idPuesto = p.idPuesto

      WHERE ce.idEmpresa = ${companyId}
        AND p.Activo = 1
        AND p.aprobada = 1;
    `;
  }
}