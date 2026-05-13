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
}