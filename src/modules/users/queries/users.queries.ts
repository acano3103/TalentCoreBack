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

  static async getModules(prisma: PrismaService, userId: number): Promise<{ Descripcion: string }[]> {
    // 1. Primero obtenemos los IDs de los roles activos del usuario
    const rolesRaw = await prisma.$queryRaw<{ idRol: number }[]>`
    SELECT idRol FROM RelUsuarioRol 
    WHERE idUsuario = ${userId} AND activo = 1
  `;

    const rolesIds = rolesRaw.map(r => r.idRol);

    // Si el usuario no tiene roles asignados, evitamos que truene el IN y retornamos vacío
    if (rolesIds.length === 0) return [];

    // 2. Traemos las descripciones únicas de los módulos donde tenga permiso de ver (puedeVer = 1)
    return prisma.$queryRaw<{ Descripcion: string }[]>`
    SELECT DISTINCT m.Descripcion
    FROM RelRolPermisos p
    JOIN CatModulos m ON m.idModulo = p.idModulo
    WHERE p.idRol IN (${Prisma.join(rolesIds)}) 
      AND p.puedeVer = 1 
      AND p.activo = 1 
      AND m.Activo = 1
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
      LEFT JOIN RelUsuarioRol r ON r.idUsuario = u.id AND r.activo = 1
      LEFT JOIN CatRoles c ON c.idRol = r.idRol AND c.activo = 1
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