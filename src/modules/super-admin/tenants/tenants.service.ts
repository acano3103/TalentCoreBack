// src/modules/super-admin/tenants/tenants.service.ts
import { Injectable, ConflictException, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { DjangoPasswordHasher } from '../../../common/utils/django-password.util';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService
  ) { }

  private readonly logger = new Logger(TenantsService.name);

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // Función para obtener todos los tenants paginados y con búsqueda
  async findAll(page: number = 1, limit: number = 10, search: string = '') {
    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.max(1, Number(limit) || 10);
    const skip = (pageNumber - 1) * limitNumber;

    // Condición base de búsqueda
    const whereCondition: any = {};

    // Filtro de búsqueda por nombre o slug del tenant
    if (search && search.trim() !== '') {
      const cleanSearch = search.trim();
      whereCondition.OR = [
        { nombre: { contains: cleanSearch } },
        { slug: { contains: cleanSearch } },
      ];
    }

    // Ejecución en paralelo de la consulta paginada y el conteo total
    const [tenants, total] = await Promise.all([
      this.prisma.catTenants.findMany({
        where: whereCondition,
        include: {
          _count: {
            select: { auth_user: true },
          },
        },
        skip: skip,
        take: limitNumber,
        orderBy: { fecha_creacion: 'desc' },
      }),
      this.prisma.catTenants.count({ where: whereCondition }),
    ]);

    // Si no hay tenants en la primera página y no hay filtro activo
    if ((!tenants || tenants.length === 0) && pageNumber === 1 && !search) {
      return {
        tenants: [],
        total: 0,
        currentPage: pageNumber,
        totalPages: 1,
      };
    }

    // Mapear y formatear la respuesta para el frontend
    const flattenedTenants = tenants.map((t) => ({
      idTenant: t.idTenant,
      uuid: t.uuid,
      nombre: t.nombre,
      slug: t.slug,
      activo: Boolean(t.activo),
      totalUsuarios: t._count.auth_user,
      fecha_creacion: t.fecha_creacion,
    }));

    return {
      tenants: flattenedTenants,
      total,
      currentPage: pageNumber,
      totalPages: Math.ceil(total / limitNumber) || 1,
    };
  }

  async create(dto: CreateTenantDto) {
    const slug = this.generateSlug(dto.tenantName);

    // Verificar si el slug o el correo ya existen
    const existingSlug = await this.prisma.catTenants.findUnique({ where: { slug } });
    if (existingSlug) {
      throw new ConflictException(`Ya existe un tenant con el nombre o código '${slug}' `);
    }

    const existingUser = await this.prisma.auth_user.findFirst({
      where: { username: dto.adminEmail },
    });
    if (existingUser) {
      throw new ConflictException(`Ya existe un usuario con el nombre de usuario '${dto.adminEmail}'`);
    }

    const hashedPassword = DjangoPasswordHasher.hash(dto.adminPassword);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Crear Tenant
        const newTenant = await tx.catTenants.create({
          data: {
            uuid: uuidv4(),
            nombre: dto.tenantName,
            slug,
            activo: true,
            fecha_creacion: new Date(),
          },
        });

        // 2. Crear el usuario Administrador del cliente
        const newUser = await tx.auth_user.create({
          data: {
            uuid: uuidv4(),
            username: dto.adminUsername,
            email: dto.adminEmail,
            first_name: dto.adminFirstName,
            last_name: dto.adminLastName,
            phone: dto.adminPhone || '',
            password: hashedPassword,
            is_superuser: false,
            is_staff: true,
            is_active: true,
            date_joined: new Date(),
            idTenant: newTenant.idTenant,
          },
        });

        // 3. Crear la relación del usuario con su Rol asignado
        await tx.relUsuarioRol.create({
          data: {
            idUsuario: newUser.id,
            idRol: 1,
            activo: true,
          },
        });

        return {
          message: "Tenant creado exitosamente",
          data: {
            tenant: {
              idTenant: newTenant.idTenant,
              nombre: newTenant.nombre,
              slug: newTenant.slug,
            },
            adminUser: {
              id: newUser.id,
              email: newUser.email,
            },
          }
        };
      });
    } catch (error: any) {
      throw new InternalServerErrorException(
        error.message || 'Failed to create tenant transaction'
      );
    }
  }
}