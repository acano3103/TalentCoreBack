// src/modules/super-admin/tenants/tenants.service.ts
import { Injectable, ConflictException, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { DjangoPasswordHasher } from '../../../common/utils/django-password.util';
import { v4 as uuidv4 } from 'uuid';
import { MODULE_BLUEPRINTS, PERMISSION_BLUEPRINTS, ROLE_NAMES } from './blueprints/tenant-blueprints';
import { UpdateTenantModulesDto } from './dto/update-tenant-modules.dto';

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

  async findOne(id: string) {
    const tenantId = Number(id);

    const [tenant, users, roles, modules] = await Promise.all([
      this.prisma.catTenants.findUnique({ where: { idTenant: tenantId } }),
      this.prisma.auth_user.findMany({ where: { idTenant: tenantId } }),
      this.prisma.catRoles.findMany({ where: { idTenant: tenantId } }),
      this.prisma.catModulos.findMany({ where: { idTenant: tenantId } }),
    ]);

    if (!tenant) {
      throw new NotFoundException(`Tenant con id ${id} no encontrado`);
    }

    return {
      ...tenant,
      users,
      roles,
      modules,
    };
  }

  async create(dto: CreateTenantDto) {
    const slug = this.generateSlug(dto.tenantName);

    const existingSlug = await this.prisma.catTenants.findUnique({ where: { slug } });
    if (existingSlug) {
      throw new ConflictException(`Ya existe un tenant con el nombre o código '${slug}'`);
    }

    const existingUser = await this.prisma.auth_user.findFirst({
      where: { username: dto.adminEmail },
    });
    if (existingUser) {
      throw new ConflictException(`Ya existe un usuario con el nombre de usuario '${dto.adminEmail}'`);
    }

    const hashedPassword = DjangoPasswordHasher.hash(dto.adminPassword);

    try {
      // Configuramos timeout a 25 segundos y maxWait a 10 segundos
      return await this.prisma.$transaction(
        async (tx) => {
          // 1. Crear el Tenant
          const newTenant = await tx.catTenants.create({
            data: {
              uuid: uuidv4(),
              nombre: dto.tenantName,
              slug,
              activo: true,
              fecha_creacion: new Date(),
            },
          });
          const tenantId = newTenant.idTenant;

          const moduleCodeToIdMap = new Map<string, number>();

          // 2.1 Insertar módulos Padres en paralelo (idPadre = null)
          const parentModules = MODULE_BLUEPRINTS.filter(m => m.codigoPadre === null);
          const createdParents = await Promise.all(
            parentModules.map(mod =>
              tx.catModulos.create({
                data: {
                  idTenant: tenantId,
                  Descripcion: mod.descripcion,
                  Codigo: mod.codigo,
                  idPadre: null,
                  Activo: true,
                },
              })
            )
          );
          createdParents.forEach(mod => {
            if (mod.Codigo) moduleCodeToIdMap.set(mod.Codigo, mod.idModulo);
          });

          // 2.2 Insertar módulos Hijos en paralelo
          const childModules = MODULE_BLUEPRINTS.filter(m => m.codigoPadre !== null);
          const createdChildren = await Promise.all(
            childModules.map(mod => {
              const parentId = moduleCodeToIdMap.get(mod.codigoPadre!) || null;
              return tx.catModulos.create({
                data: {
                  idTenant: tenantId,
                  Descripcion: mod.descripcion,
                  Codigo: mod.codigo,
                  idPadre: parentId,
                  Activo: true,
                },
              });
            })
          );
          createdChildren.forEach(mod => {
            if (mod.Codigo) moduleCodeToIdMap.set(mod.Codigo, mod.idModulo);
          });

          // 3. Insertar Roles en paralelo para este Tenant
          const roleNameToIdMap = new Map<string, number>();
          const createdRoles = await Promise.all(
            ROLE_NAMES.map(roleName =>
              tx.catRoles.create({
                data: {
                  idTenant: tenantId,
                  descripcion: roleName,
                  activo: true,
                },
              })
            )
          );
          createdRoles.forEach(role => {
            roleNameToIdMap.set(role.descripcion, role.idRol);
          });

          // 4. Insertar la Matriz de Permisos
          const permissionsData = PERMISSION_BLUEPRINTS.map((p) => {
            const resolvedRoleId = roleNameToIdMap.get(p.rolName);
            const resolvedModuleId = moduleCodeToIdMap.get(p.moduloCodigo);

            if (!resolvedRoleId || !resolvedModuleId) return null;

            return {
              idTenant: tenantId,
              idRol: resolvedRoleId,
              idModulo: resolvedModuleId,
              puedeVer: p.puedeVer,
              puedeCrear: p.puedeCrear,
              puedeActualizar: p.puedeActualizar,
              puedeEliminar: p.puedeEliminar,
              activo: true,
            };
          }).filter((p): p is NonNullable<typeof p> => p !== null);

          await tx.relRolPermisos.createMany({
            data: permissionsData,
          });

          // 5. Crear el Usuario Administrador asignado a este Tenant
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
              idTenant: tenantId,
            },
          });

          // 6. Asignar el Rol 'Admin' recién generado
          const adminRoleId = roleNameToIdMap.get('Admin')!;
          await tx.relUsuarioRol.create({
            data: {
              idUsuario: newUser.id,
              idRol: adminRoleId,
              activo: true,
            },
          });

          return {
            message: 'Tenant y entorno inicial creados exitosamente',
            data: {
              tenant: {
                idTenant: newTenant.idTenant,
                nombre: newTenant.nombre,
                slug: newTenant.slug,
              },
              adminUser: {
                id: newUser.id,
                email: newUser.email,
                idRol: adminRoleId,
              },
            },
          };
        },
        {
          maxWait: 10000, // Tiempo máximo de espera para obtener conexión (10s)
          timeout: 25000, // Tiempo total permitido para la transacción (25s)
        }
      );
    } catch (error: any) {
      throw new InternalServerErrorException(
        error.message || 'Failed to create tenant transaction'
      );
    }
  }

  async updateModules(tenantId: number, dto: UpdateTenantModulesDto) {
    // Validar existencia del tenant
    const tenant = await this.prisma.catTenants.findUnique({
      where: { idTenant: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant con id ${tenantId} no encontrado`);
    }

    // Ejecutar actualización en transacción
    await this.prisma.$transaction(
      async (tx) => {
        await Promise.all(
          dto.modules.map((item) =>
            tx.catModulos.updateMany({
              where: {
                idModulo: item.idModulo,
                idTenant: tenantId,
              },
              data: {
                Activo: item.activo,
              },
            })
          )
        );
      },
      {
        timeout: 10000,
      }
    );

    return {
      message: 'Módulos actualizados exitosamente',
      totalUpdated: dto.modules.length,
    };
  }
}