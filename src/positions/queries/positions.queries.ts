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
}