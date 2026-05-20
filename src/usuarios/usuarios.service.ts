import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DjangoPasswordHasher } from 'src/common/utils/django-password.util';
import { CreateUsuarioDto } from './dto/create-usuario.dto';

export interface AuthUserRow {
    id: number;
    uuid: string;
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    is_superuser: boolean | number;
    is_staff: boolean | number;
    is_active: boolean | number;
    last_login: Date | null;
    date_joined: Date;
}

@Injectable()
export class UsuariosService {
    constructor(private readonly prisma: PrismaService) { }

    /** GET all users — password never returned */
    async findAll(): Promise<AuthUserRow[]> {
        return this.prisma.$queryRaw<AuthUserRow[]>`
            SELECT
                id, uuid, username, first_name, last_name,
                email, phone, is_superuser, is_staff, is_active,
                last_login, date_joined
            FROM auth_user
            ORDER BY id ASC
        `;
    }

    /** GET single user by id — password never returned */
    async findOne(id: number): Promise<AuthUserRow | null> {
        const rows = await this.prisma.$queryRaw<AuthUserRow[]>`
            SELECT
                id, uuid, username, first_name, last_name,
                email, phone, is_superuser, is_staff, is_active,
                last_login, date_joined
            FROM auth_user
            WHERE id = ${id}
            LIMIT 1
        `;
        return rows[0] ?? null;
    }

    /** POST — create user in auth_user + assign role in relUsuarioRol */
    async create(dto: CreateUsuarioDto): Promise<AuthUserRow> {
        // 1. Check username uniqueness
        const existing = await this.prisma.$queryRaw<{ id: number }[]>`
            SELECT id FROM auth_user WHERE BINARY username = ${dto.username} LIMIT 1
        `;
        if (existing.length > 0) {
            throw new ConflictException(`El nombre de usuario "${dto.username}" ya está en uso.`);
        }

        // 2. Hash password using Django-compatible PBKDF2
        const hashedPassword = DjangoPasswordHasher.hash(dto.password);

        // 3. Insert into auth_user
        await this.prisma.$executeRaw`
            INSERT INTO auth_user
                (password, last_login, is_superuser, username, first_name, last_name,
                 email, phone, is_staff, is_active, date_joined)
            VALUES
                (${hashedPassword}, NULL, 0, ${dto.username}, ${dto.first_name}, ${dto.last_name},
                 ${dto.email}, ${dto.phone ?? ''}, 0, ${dto.is_active ? 1 : 0}, NOW())
        `;

        // 4. Get the new user id
        const newUsers = await this.prisma.$queryRaw<{ id: number }[]>`
            SELECT id FROM auth_user WHERE BINARY username = ${dto.username} LIMIT 1
        `;
        const newUserId = newUsers[0].id;

        // 5. Assign role in relUsuarioRol
        await this.prisma.$executeRaw`
            INSERT INTO relUsuarioRol (idUsuario, idRol, activo)
            VALUES (${newUserId}, ${dto.idRol}, 1)
        `;

        // 6. Return new user (no password)
        const created = await this.findOne(newUserId);
        return created!;
    }
}
