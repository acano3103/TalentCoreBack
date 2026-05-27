import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DjangoPasswordHasher } from 'src/common/utils/django-password.util';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { AuthUserRow } from './interfaces/auth-user.interface';

@Injectable()
export class UsuariosService {
    constructor(private readonly prisma: PrismaService) { }

    /** GET all users — password never returned, includes role via relUsuarioRol */
    async findAll(): Promise<AuthUserRow[]> {
        // Complex JOIN across unrelated models (auth_user ↔ relUsuarioRol ↔ catroles)
        // No Prisma relations defined between these tables → $queryRaw justified
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

    /** GET single user by id — password never returned, includes role via relUsuarioRol */
    async findOne(id: number): Promise<AuthUserRow | null> {
        // Complex JOIN — same justification as findAll
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

    /** POST — create user in auth_user + assign role in relUsuarioRol (atomic transaction) */
    async create(dto: CreateUsuarioDto): Promise<AuthUserRow> {
        // 1. Check username uniqueness via Prisma ORM (simple unique lookup)
        const existing = await this.prisma.auth_user.findUnique({
            where: { username: dto.username },
            select: { id: true },
        });
        if (existing) {
            throw new ConflictException(`El nombre de usuario "${dto.username}" ya está en uso.`);
        }

        // 2. Hash password using Django-compatible PBKDF2
        const hashedPassword = DjangoPasswordHasher.hash(dto.password);

        // 3. Atomic transaction: insert auth_user + relUsuarioRol together
        //    If either insert fails, both are rolled back — DB stays consistent
        const newUserId = await this.prisma.$transaction(async (tx) => {
            // Create user via Prisma ORM (simple insert)
            const newUser = await tx.auth_user.create({
                data: {
                    password:    hashedPassword,
                    last_login:  null,
                    is_superuser: false,
                    username:    dto.username,
                    first_name:  dto.first_name,
                    last_name:   dto.last_name,
                    email:       dto.email,
                    is_staff:    false,
                    is_active:   dto.is_active,
                    date_joined: new Date(),
                },
                select: { id: true },
            });

            // Assign role via Prisma ORM (simple insert)
            await tx.relUsuarioRol.create({
                data: {
                    idUsuario: newUser.id,
                    idRol:     dto.idRol,
                    activo:    true,
                },
            });

            return newUser.id;
        });

        // 4. Return created user with role data (uses complex JOIN query)
        const created = await this.findOne(newUserId);
        return created!;
    }

    /** PATCH — update user fields and/or role (atomic transaction) */
    async update(id: number, dto: UpdateUsuarioDto): Promise<AuthUserRow> {
        // Guard: ensure user exists
        const existing = await this.prisma.auth_user.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!existing) {
            throw new NotFoundException(`Usuario con id ${id} no encontrado.`);
        }

        // Build partial data object — only include fields sent in body
        const userData: Record<string, unknown> = {};
        if (dto.first_name !== undefined) userData.first_name = dto.first_name;
        if (dto.last_name  !== undefined) userData.last_name  = dto.last_name;
        if (dto.email      !== undefined) userData.email      = dto.email;
        if (dto.is_active  !== undefined) userData.is_active  = dto.is_active;

        await this.prisma.$transaction(async (tx) => {
            // Update auth_user fields (Prisma ORM — simple update)
            if (Object.keys(userData).length > 0) {
                await tx.auth_user.update({
                    where: { id },
                    data: userData,
                });
            }

            // Update role if provided: deactivate old, insert new
            if (dto.idRol !== undefined) {
                // Deactivate all active roles for this user
                await tx.relUsuarioRol.updateMany({
                    where: { idUsuario: id, activo: true },
                    data:  { activo: false },
                });
                // Insert new active role
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
        // Guard: ensure user exists and is currently active
        const existing = await this.prisma.auth_user.findUnique({
            where: { id },
            select: { id: true, is_active: true },
        });
        if (!existing) {
            throw new NotFoundException(`Usuario con id ${id} no encontrado.`);
        }

        // Soft-delete via Prisma ORM (simple update — no $queryRaw needed)
        await this.prisma.auth_user.update({
            where: { id },
            data:  { is_active: false },
        });

        const deactivated = await this.findOne(id);
        return deactivated!;
    }
}
