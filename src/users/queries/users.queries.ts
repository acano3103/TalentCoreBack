import { PrismaService } from "src/prisma/prisma.service";

export class UsersQueries {
  static async getUsername(prisma: PrismaService, userId: number) {
    return prisma.$queryRaw<{ username: string }[]>`
      SELECT username FROM auth_user WHERE id = ${userId}
    `;
  }

  static async getRoles(prisma: PrismaService, userId: number) {
    return prisma.$queryRaw<{ descripcion: string }[]>`
      SELECT c.descripcion 
      FROM RelUsuarioRol r
      JOIN CatRoles c ON c.idRol = r.idRol
      WHERE r.idUsuario = ${userId} AND r.activo = 1 AND c.activo = 1
    `;
  }

  static async getEnterprises(prisma: PrismaService, userId: number) {
    return prisma.$queryRaw<{ idEmpresa: number; nombre_comercial: string }[]>`
      SELECT e.idEmpresa, e.nombre_comercial
      FROM RelUsuarioEmpresa r
      JOIN CatEmpresas e ON e.idEmpresa = r.idEmpresa
      WHERE r.idUsuario = ${userId} AND r.activo = 1 AND e.activo = 1
    `;
  }

  static async getModules(prisma: PrismaService, userId: number) {
    return prisma.$queryRaw<{ Descripcion: string }[]>`
      SELECT m.Descripcion
      FROM RelModuloUsuario r
      JOIN CatModulos m ON m.idModulo = r.idModulo
      WHERE r.idUsuario = ${userId} AND r.Activo = 1 AND m.Activo = 1
    `;
  }

  static async getSites(prisma: PrismaService, userId: number) {
    return prisma.$queryRaw<{ idSite: number; Descripcion: string }[]>`
            SELECT s.idSite, s.Descripcion
            FROM RelUsuarioSite r
            JOIN CatSites s ON s.idSite = r.idSite
            WHERE r.idUsuario = ${userId} AND r.activo = 1
        `;
  }
}