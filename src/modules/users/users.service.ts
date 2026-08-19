import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DjangoPasswordHasher } from 'src/common/utils/django-password.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthUserRow } from './interfaces/auth-user.interface';
import { UsersQueries } from './queries/users.queries';
import { randomUUID } from 'crypto';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  async getUserBasicInfo(userID: number) {
    return await this.prisma.auth_user.findUnique({
      where: { id: userID },
      select: { id: true, uuid: true, username: true, first_name: true, last_name: true, email: true, phone: true },
    });
  }

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
  async findAll(page: number, limit: number, search?: string) {
    const offset = (page - 1) * limit;

    const [data, total] = await Promise.all([
      UsersQueries.findAllPaginated(this.prisma, limit, offset, search),
      UsersQueries.countAll(this.prisma, search),
    ]);

    return {
      data,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /** GET single user by id — password never returned, includes role via relUsuarioRol JOIN */
  async findOne(id: number): Promise<any | null> {
    // Obtener los datos base del usuario y su rol
    const userRows = await this.prisma.$queryRaw<any[]>`
      SELECT 
        u.id, u.uuid, u.username, u.first_name, u.last_name, 
        u.email, u.phone, u.is_superuser, u.is_staff, u.is_active,
        u.last_login, u.date_joined,
        r.idRol, c.descripcion AS rol_descripcion
      FROM auth_user u
      LEFT JOIN RelUsuarioRol r ON r.idUsuario = u.id AND r.activo = 1
      LEFT JOIN CatRoles c ON c.idRol = r.idRol AND c.activo = 1
      WHERE u.id = ${id}
      LIMIT 1
    `;

    const userBase = userRows[0];
    if (!userBase) return null;

    // Obtener todas las empresas asignadas activas de este usuario
    const empresasAsignadas = await this.prisma.relUsuarioEmpresa.findMany({
      where: { idUsuario: id, activo: true },
      select: { idEmpresa: true }
    });

    // Obtener todos los sites (ubicaciones) asignados activos de este usuario
    const sitesAsignados = await this.prisma.relUsuarioSite.findMany({
      where: { idUsuario: id, activo: true },
      select: { idSite: true }
    });

    const validSiteIds = sitesAsignados
      .map(s => s.idSite)
      .filter((idSite): idSite is number => idSite !== null && idSite !== undefined);

    // Traemos los detalles de los sites para saber a qué empresa pertenecen y agruparlos de forma correcta
    const sitesDetalle = await this.prisma.catSites.findMany({
      where: {
        idSite: { in: validSiteIds },
        Activo: true
      },
      select: { idSite: true, idEmpresa: true }
    });

    // Construir la estructura jerárquica de 'accessStructure' para el Front
    const accessStructure: Record<number, number[]> = {};

    // Inicializamos las empresas asignadas en el objeto de estructura de forma segura
    empresasAsignadas.forEach(emp => {
      if (emp.idEmpresa !== null && emp.idEmpresa !== undefined) {
        accessStructure[emp.idEmpresa] = [];
      }
    });

    sitesDetalle.forEach(site => {
      if (site.idEmpresa !== null && site.idEmpresa !== undefined && site.idSite !== null && site.idSite !== undefined) {
        if (accessStructure[site.idEmpresa]) {
          accessStructure[site.idEmpresa].push(site.idSite);
        }
      }
    });

    const empleadoVinculado = await this.prisma.empleados.findFirst({
      where: { idUsuario: userBase.uuid },
      select: { idEmpleado: true, nombre: true, primerApellido: true, segundoApellido: true }
    });

    // Retornar el objeto consolidado final
    return {
      ...userBase,
      idEmpleado: empleadoVinculado ? empleadoVinculado.idEmpleado : null,
      empleadoData: empleadoVinculado ? `${empleadoVinculado.nombre} ${empleadoVinculado.primerApellido}` : null,
      accessStructure
    };
  }

  /** POST — create user + assign role atomically via $transaction */
  async create(dto: CreateUserDto): Promise<AuthUserRow> {
    // Validar que el nombre de usuario no exista previamente
    const existing = await this.prisma.auth_user.findUnique({
      where: { username: dto.username },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`El nombre de usuario "${dto.username}" ya está en uso.`);
    }

    // Hashear el password con formato Django (PBKDF2-SHA256)
    const hashedPassword = DjangoPasswordHasher.hash(dto.password);

    // Ejecutar transacciones atómicas distribuidas en base a la nueva estructura relacional
    const newUserId = await this.prisma.$transaction(async (tx) => {

      // Crear el registro maestro en auth_user
      const newUser = await tx.auth_user.create({
        data: {
          uuid: randomUUID(),
          password: hashedPassword,
          last_login: null,
          is_superuser: dto.is_superuser === 1,
          username: dto.username,
          first_name: dto.first_name,
          last_name: dto.last_name,
          email: dto.email,
          phone: dto.phone,
          is_staff: dto.is_staff === 1,
          is_active: dto.is_active === 1,
          date_joined: new Date(),
        },
        select: { id: true, uuid: true },
      });

      // Crear la relación del usuario con su Rol asignado
      await tx.relUsuarioRol.create({
        data: {
          idUsuario: newUser.id,
          idRol: dto.idRol,
          activo: true,
        },
      });

      // Desestructurar la jerarquía de 'accesos' enviada desde el frontend
      const empresaIds: number[] = [];
      const siteIds: number[] = [];

      dto.accesos.forEach((acceso) => {
        empresaIds.push(acceso.idEmpresa);
        if (acceso.ubicaciones && acceso.ubicaciones.length > 0) {
          siteIds.push(...acceso.ubicaciones);
        }
      });

      // Guardar relaciones con las Empresas (relUsuarioEmpresa)
      if (empresaIds.length > 0) {
        const uniqueEmpresas = [...new Set(empresaIds)];
        await tx.relUsuarioEmpresa.createMany({
          data: uniqueEmpresas.map((idEmpresa) => ({
            idUsuario: newUser.id,
            idEmpresa,
            activo: true,
          })),
          skipDuplicates: true,
        });
      }

      // Guardar relaciones con los Sites (relUsuarioSite)
      if (siteIds.length > 0) {
        const uniqueSites = [...new Set(siteIds)];
        await tx.relUsuarioSite.createMany({
          data: uniqueSites.map((idSite) => ({
            idUsuario: newUser.id,
            idSite,
            activo: true,
          })),
          skipDuplicates: true,
        });
      }

      // Si se seleccionó un empleado, actualizar de forma inversa la tabla de empleados
      if (dto.idEmpleado) {
        // Validamos primero que el empleado realmente exista en el sistema
        const empleadoExistente = await tx.empleados.findUnique({
          where: { idEmpleado: dto.idEmpleado },
          select: { idEmpleado: true },
        });

        if (!empleadoExistente) {
          throw new NotFoundException(`El empleado con ID ${dto.idEmpleado} no fue encontrado en el catálogo.`);
        }

        // Se actualiza el campo idUsuario de la tabla empleados mapeando el UUID (String) generado
        await tx.empleados.update({
          where: { idEmpleado: dto.idEmpleado },
          data: {
            idUsuario: newUser.uuid,
          },
        });
      }

      return newUser.id;
    });

    // Retornar el usuario recién estructurado
    const created = await this.findOne(newUserId);
    return created!;
  }

  /** PUT — update user fields and/or role atomically */
  async update(id: number, dto: UpdateUserDto): Promise<any> {
    // Verificar la existencia del usuario y recuperar su UUID
    const existing = await this.prisma.auth_user.findUnique({
      where: { id },
      select: { id: true, uuid: true, username: true },
    });
    if (!existing) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado.`);
    }

    // Validar disponibilidad del username si viene en el DTO y cambió
    if (dto.username !== undefined && dto.username !== existing.username) {
      const usernameOcupado = await this.prisma.auth_user.findFirst({
        where: {
          username: dto.username,
          id: { not: id },
        },
        select: { id: true },
      });

      if (usernameOcupado) {
        throw new ConflictException(`El nombre de usuario "${dto.username}" ya está asignado a otra cuenta.`);
      }
    }

    const userData: Record<string, any> = {};
    if (dto.username !== undefined) userData.username = dto.username;
    if (dto.first_name !== undefined) userData.first_name = dto.first_name;
    if (dto.last_name !== undefined) userData.last_name = dto.last_name;
    if (dto.email !== undefined) userData.email = dto.email;
    if (dto.phone !== undefined) userData.phone = dto.phone;
    if (dto.is_active !== undefined) userData.is_active = dto.is_active;

    if (dto.password) {
      userData.password = DjangoPasswordHasher.hash(dto.password);
    }

    // Transacción Atómica total
    await this.prisma.$transaction(async (tx) => {
      // Actualizar datos maestros en auth_user
      if (Object.keys(userData).length > 0) {
        await tx.auth_user.update({ where: { id }, data: userData });
      }

      // Actualizar Rol si cambió
      if (dto.idRol !== undefined) {
        await tx.relUsuarioRol.deleteMany({
          where: { idUsuario: id },
        });
        await tx.relUsuarioRol.create({
          data: { idUsuario: id, idRol: dto.idRol, activo: true },
        });
      }

      // Actualizar Accesos Estructurados (Empresas y Sites)
      if (dto.accesos !== undefined) {
        const newEmpresaIds: number[] = [];
        const newSiteIds: number[] = [];

        dto.accesos.forEach((ac) => {
          newEmpresaIds.push(ac.idEmpresa);
          if (ac.ubicaciones && ac.ubicaciones.length > 0) {
            newSiteIds.push(...ac.ubicaciones);
          }
        });

        // Removemos las empresas anteriores para este usuario
        await tx.relUsuarioEmpresa.deleteMany({ where: { idUsuario: id } });
        if (newEmpresaIds.length > 0) {
          const uniqueEmpresas = [...new Set(newEmpresaIds)];
          await tx.relUsuarioEmpresa.createMany({
            data: uniqueEmpresas.map((idEmpresa) => ({
              idUsuario: id,
              idEmpresa,
              activo: true,
            })),
          });
        }

        // Removemos las sedes anteriores para este usuario
        await tx.relUsuarioSite.deleteMany({ where: { idUsuario: id } });
        if (newSiteIds.length > 0) {
          const uniqueSites = [...new Set(newSiteIds)];
          await tx.relUsuarioSite.createMany({
            data: uniqueSites.map((idSite) => ({
              idUsuario: id,
              idSite,
              activo: true,
            })),
          });
        }
      }

      // Sincronizar Vinculación de Empleados de forma inversa (idUsuario almacena el UUID String)
      if (dto.idEmpleado !== undefined) {
        await tx.empleados.updateMany({
          where: { idUsuario: existing.uuid },
          data: { idUsuario: null },
        });

        if (dto.idEmpleado !== null) {
          const empleadoExistente = await tx.empleados.findUnique({
            where: { idEmpleado: dto.idEmpleado },
            select: { idEmpleado: true },
          });

          if (!empleadoExistente) {
            throw new NotFoundException(`El empleado con ID ${dto.idEmpleado} no existe.`);
          }

          await tx.empleados.update({
            where: { idEmpleado: dto.idEmpleado },
            data: { idUsuario: existing.uuid },
          });
        }
      }
    }, {
      timeout: 15000
    });

    const updated = await this.findOne(id);
    return updated!;
  }

  async changeStatus(id: string, active: boolean) {
    const idUser = Number(id);
    await this.prisma.auth_user.update({
      where: { id: idUser },
      data: {
        is_active: active,
      },
    });

    return {
      message: active ? 'Usuario activado correctamente' : 'Usuario desactivado correctamente'
    };
  }
}
