import { PrismaService } from "src/prisma/prisma.service";
import { AuthUserRow } from "../interfaces/auth-user.interface";
import { Prisma } from "generated/prisma/client";

export class UsersQueries {
  static async getUsername(prisma: PrismaService, userId: number) {
    return prisma.$queryRaw<{ username: string }[]>`
      SELECT username FROM auth_user WHERE id = ${userId}
    `;
  }

  static async getRoles(prisma: PrismaService, userId: number) {
    return prisma.$queryRaw<{ descripcion: string }[]>`
      SELECT c.descripcion 
      FROM relUsuarioRol r
      JOIN catroles c ON c.idRol = r.idRol
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

  static async findAllPaginated(prisma: PrismaService, limit: number, offset: number, search?: string): Promise<AuthUserRow[]> {
    const searchFilter = search
      ? Prisma.sql`WHERE 
          u.username LIKE ${`%${search}%`} OR 
          u.first_name LIKE ${`%${search}%`} OR 
          u.last_name LIKE ${`%${search}%`} OR 
          u.email LIKE ${`%${search}%`}`
      : Prisma.empty;

    return prisma.$queryRaw<AuthUserRow[]>`
      SELECT
        u.id, u.uuid, u.username, u.first_name, u.last_name,
        u.email, u.phone, u.is_superuser, u.is_staff, u.is_active,
        u.last_login, u.date_joined,
        r.idRol, c.descripcion AS rol_descripcion
      FROM auth_user u
      LEFT JOIN relUsuarioRol r ON r.idUsuario = u.id AND r.activo = 1
      LEFT JOIN catroles c ON c.idRol = r.idRol AND c.activo = 1
      ${searchFilter}
      ORDER BY u.id ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  static async countAll(prisma: PrismaService, search?: string): Promise<number> {
    const searchFilter = search
      ? Prisma.sql`WHERE 
          u.username LIKE ${`%${search}%`} OR 
          u.first_name LIKE ${`%${search}%`} OR 
          u.last_name LIKE ${`%${search}%`} OR 
          u.email LIKE ${`%${search}%`}`
      : Prisma.empty;

    const countResult = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count 
      FROM auth_user u
      ${searchFilter}
    `;

    return countResult[0]?.count ? Number(countResult[0].count) : 0;
  }
}