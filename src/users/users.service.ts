import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DjangoPasswordHasher } from 'src/common/utils/django-password.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthUserRow } from './interfaces/auth-user.interface';
import { UsersQueries } from './queries/users.queries';
import { randomUUID } from 'crypto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  async getUserFullInfo(userId: number) {
    const [username, roles, enterprises, modules, sites] = await Promise.all([
      UsersQueries.getUsername(this.prisma, userId),
      UsersQueries.getRoles(this.prisma, userId),
      UsersQueries.getEnterprises(this.prisma, userId),
      UsersQueries.getModules(this.prisma, userId),
      UsersQueries.getSites(this.prisma, userId),
    ]);

    return {
      id: userId,
      username: username?.[0]?.username ?? null,
      roles: roles.map(r => r.descripcion),
      enterprises: enterprises.map(e => ({
        id: e.idEmpresa,
        name: e.nombre_comercial,
      })),
      modules: modules.map(m => m.Descripcion),
      sites: sites.map(s => ({
        id: s.idSite,
        name: s.Descripcion,
      })),
    };
  }

  /** GET all users — password never returned, includes role via relUsuarioRol JOIN */
  async findAll(): Promise<AuthUserRow[]> {
    return this.prisma.$queryRaw<AuthUserRow[]>`
      SELECT
        u.id, u.uuid, u.username, u.first_name, u.last_name,
        u.email, u.phone, u.is_superuser, u.is_staff, u.is_active,
        u.last_login, u.date_joined,
        r.idRol, c.descripcion AS rol_descripcion
      FROM auth_user u
      LEFT JOIN relUsuarioRol r ON r.idUsuario = u.id AND r.activo = 1
      LEFT JOIN catroles c ON c.idRol = r.idRol AND c.activo = 1
      ORDER BY u.id ASC
    `;
  }

  /** GET single user by id — password never returned, includes role via relUsuarioRol JOIN */
  async findOne(id: number): Promise<AuthUserRow | null> {
    const rows = await this.prisma.$queryRaw<AuthUserRow[]>`
      SELECT
        u.id, u.uuid, u.username, u.first_name, u.last_name,
        u.email, u.phone, u.is_superuser, u.is_staff, u.is_active,
        u.last_login, u.date_joined,
        r.idRol, c.descripcion AS rol_descripcion
      FROM auth_user u
      LEFT JOIN relUsuarioRol r ON r.idUsuario = u.id AND r.activo = 1
      LEFT JOIN catroles c ON c.idRol = r.idRol AND c.activo = 1
      WHERE u.id = ${id}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  /** POST — create user + assign role atomically via $transaction */
  async create(dto: CreateUserDto): Promise<AuthUserRow> {
    const existing = await this.prisma.auth_user.findUnique({
      where: { username: dto.username },
      select: { id: true },
    });
    if (existing) throw new ConflictException(`El nombre de usuario "${dto.username}" ya está en uso.`);

    const hashedPassword = DjangoPasswordHasher.hash(dto.password);

    const newUserId = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.auth_user.create({
        data: {
          uuid: randomUUID(),
          password:     hashedPassword,
          last_login:   null,
          is_superuser: false,
          username:     dto.username,
          first_name:   dto.first_name,
          last_name:    dto.last_name,
          email:        dto.email,
          phone:        dto.phone,
          is_staff:     false,
          is_active:    dto.is_active,
          date_joined:  new Date(),
        },
        select: { id: true },
      });

      await tx.relUsuarioRol.create({
        data: {
          idUsuario: newUser.id,
          idRol:     dto.idRol,
          activo:    true,
        },
      });

      return newUser.id;
    });

    const created = await this.findOne(newUserId);
    return created!;
  }

  /** PATCH — update user fields and/or role atomically */
  async update(id: number, dto: UpdateUserDto): Promise<AuthUserRow> {
    const existing = await this.prisma.auth_user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Usuario con id ${id} no encontrado.`);

    const userData: Record<string, unknown> = {};
    if (dto.first_name !== undefined) userData.first_name = dto.first_name;
    if (dto.last_name  !== undefined) userData.last_name  = dto.last_name;
    if (dto.email      !== undefined) userData.email      = dto.email;
    if (dto.phone      !== undefined) userData.phone      = dto.phone;
    if (dto.is_active  !== undefined) userData.is_active  = dto.is_active;

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length > 0) {
        await tx.auth_user.update({ where: { id }, data: userData });
      }

      if (dto.idRol !== undefined) {
        // Deactivate previous role, insert new one
        await tx.relUsuarioRol.updateMany({
          where: { idUsuario: id, activo: true },
          data:  { activo: false },
        });
        await tx.relUsuarioRol.create({
          data: { idUsuario: id, idRol: dto.idRol, activo: true },
        });
      }
    });

    const updated = await this.findOne(id);
    return updated!;
  }

  /** PATCH /:id/desactivar — soft-delete: sets is_active = false */
  async deactivate(id: number): Promise<AuthUserRow> {
    const existing = await this.prisma.auth_user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Usuario con id ${id} no encontrado.`);

    await this.prisma.auth_user.update({
      where: { id },
      data:  { is_active: false },
    });

    const deactivated = await this.findOne(id);
    return deactivated!;
  }
}
