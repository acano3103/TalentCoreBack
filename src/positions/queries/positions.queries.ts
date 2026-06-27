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
        m.Descripcion AS Modalidad
      FROM Postulaciones p
      INNER JOIN CatPuestos c ON p.idVacante = c.idPuesto
      LEFT JOIN CatModalidad m ON c.idModalidad = m.idModalidad
      LEFT JOIN PerfilPostulante pp ON p.idPostulacion = pp.idPostulacion
      WHERE p.idVacante = ${idPuesto}
      AND pp.score_global IS NOT NULL
      ORDER BY pp.score_global DESC;
    `;
  }

  static async getActivePositions(prisma: PrismaService, companyId: number, rbacFilter: string = '') {
    return await prisma.$queryRawUnsafe(`
      SELECT 
        v.idVacante AS idPuesto,
        p.NombrePuesto,
        p.DescripcionPuesto,
        v.SalarioMinimo,
        v.SalarioMaximo,
        NULL AS Vacantes,
        NULL AS Edad,
        a.Descripcion AS Area,
        tp.Descripcion AS TipoPuesto,
        tc.Descripcion AS TipoContratacion,
        m.Descripcion AS Modalidad,
        e.Descripcion AS Escolaridad,
        s.Descripcion AS Site,
        COALESCE(counts.total_cvs, 0) AS TotalCVs,
        COALESCE(counts.total_aprobados, 0) AS TotalAprobados,
        COALESCE(counts.total_rechazados, 0) AS TotalRechazados
      FROM Vacantes v
      INNER JOIN CatPuestos p ON v.idPuesto = p.idPuesto
      LEFT JOIN CatAreas a ON p.idArea = a.idArea
      LEFT JOIN CatSites s ON s.idSite = v.idSite
      LEFT JOIN CatTipoPuesto tp ON tp.idTipoPuesto = p.idTipoPuesto
      LEFT JOIN CatTipoContratacion tc ON tc.idTipoContratacion = p.idTipoContratacion
      LEFT JOIN CatModalidad m ON m.idModalidad = p.idModalidad
      LEFT JOIN CatEscolaridad e ON e.idNivelEstudios = p.idNivelEstudios
      LEFT JOIN (
        SELECT 
          post.idVacante,
          COUNT(post.idPostulacion) AS total_cvs,
          SUM(CASE WHEN perf.score_global >= 8 THEN 1 ELSE 0 END) AS total_aprobados,
          SUM(CASE WHEN perf.score_global < 8 OR perf.score_global IS NULL THEN 1 ELSE 0 END) AS total_rechazados
        FROM Postulaciones post
        LEFT JOIN PerfilPostulante perf ON post.idPostulacion = perf.idPostulacion
        GROUP BY post.idVacante
      ) counts ON counts.idVacante = v.idVacante
      WHERE v.idEmpresa = ${companyId}
        AND v.idEstatusVacante = 1
        ${rbacFilter}
    `);
  }
}