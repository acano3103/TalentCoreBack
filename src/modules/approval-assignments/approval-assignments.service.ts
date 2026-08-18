import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateApprovalAssignmentDto } from './dto/create-approval-assignment.dto';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@Injectable()
export class ApprovalAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(idRolAprobador?: number, idArea?: number) {
    return this.prisma.asignacionAprobador.findMany({
      where: {
        activo: true,
        ...(idRolAprobador ? { idRolAprobador } : {}),
        ...(idArea !== undefined ? { idArea } : {})
      },
      include: {
        CatRolAprobador: true,
        CatAreas: true,
        auth_user: {
          select: {
            id: true,
            uuid: true,
            username: true,
            first_name: true,
            last_name: true,
            email: true
          }
        }
      },
      orderBy: {
        idAsignacionAprobador: 'asc'
      }
    });
  }

  async create(dto: CreateApprovalAssignmentDto, activeUser: ActiveUserDto) {
    // 1. Validar que el usuario activo sea Administrador (idRol = 1)
    const activeUserRoles = await this.prisma.relUsuarioRol.findMany({
      where: { idUsuario: activeUser.id, activo: true }
    });
    const isAdmin = activeUserRoles.some(r => r.idRol === 1);
    if (!isAdmin) {
      throw new ForbiddenException('Solo un usuario Administrador puede asignar roles de aprobación.');
    }

    // 2. Validar que el rol de aprobación exista
    const rol = await this.prisma.catRolAprobador.findUnique({
      where: { idRolAprobador: dto.idRolAprobador }
    });
    if (!rol) {
      throw new NotFoundException(`El rol de aprobador con id ${dto.idRolAprobador} no existe.`);
    }

    // 3. Validar que el usuario a asignar exista
    const user = await this.prisma.auth_user.findUnique({
      where: { id: dto.idUsuario }
    });
    if (!user) {
      throw new NotFoundException(`El usuario con id ${dto.idUsuario} no existe.`);
    }

    // 4. Validar que el área exista si fue proporcionada
    const areaId = dto.idArea ? Number(dto.idArea) : null;
    if (areaId) {
      const area = await this.prisma.catAreas.findUnique({
        where: { idArea: areaId }
      });
      if (!area) {
        throw new NotFoundException(`El área con id ${areaId} no existe.`);
      }
    }

    // 5. Validar si ya existe una asignación activa para ese rol + área
    const existingActive = await this.prisma.asignacionAprobador.findFirst({
      where: {
        idRolAprobador: dto.idRolAprobador,
        idArea: areaId,
        activo: true
      },
      include: {
        auth_user: {
          select: {
            first_name: true,
            last_name: true,
            username: true
          }
        }
      }
    });

    if (existingActive) {
      if (existingActive.idUsuario === dto.idUsuario) {
        return existingActive;
      }
      const existingUserName = `${existingActive.auth_user?.first_name || ''} ${existingActive.auth_user?.last_name || ''}`.trim() || existingActive.auth_user?.username;
      throw new ConflictException(
        `Ya existe una persona activa asignada a este rol${areaId ? ' y área' : ''} (${existingUserName}). Desactiva la asignación actual antes de asignar a otra persona.`
      );
    }

    // 6. Si existía una asignación previa inactiva para el mismo usuario, reactivarla
    const existingInactive = await this.prisma.asignacionAprobador.findFirst({
      where: {
        idRolAprobador: dto.idRolAprobador,
        idArea: areaId,
        idUsuario: dto.idUsuario,
        activo: false
      }
    });

    if (existingInactive) {
      return await this.prisma.asignacionAprobador.update({
        where: { idAsignacionAprobador: existingInactive.idAsignacionAprobador },
        data: { activo: true },
        include: {
          CatRolAprobador: true,
          CatAreas: true,
          auth_user: {
            select: {
              id: true,
              uuid: true,
              username: true,
              first_name: true,
              last_name: true,
              email: true
            }
          }
        }
      });
    }

    // 7. Crear nueva asignación
    return await this.prisma.asignacionAprobador.create({
      data: {
        idRolAprobador: dto.idRolAprobador,
        idArea: areaId,
        idUsuario: dto.idUsuario,
        activo: true
      },
      include: {
        CatRolAprobador: true,
        CatAreas: true,
        auth_user: {
          select: {
            id: true,
            uuid: true,
            username: true,
            first_name: true,
            last_name: true,
            email: true
          }
        }
      }
    });
  }

  async remove(id: number, activeUser: ActiveUserDto) {
    // 1. Validar que el usuario activo sea Administrador
    const activeUserRoles = await this.prisma.relUsuarioRol.findMany({
      where: { idUsuario: activeUser.id, activo: true }
    });
    const isAdmin = activeUserRoles.some(r => r.idRol === 1);
    if (!isAdmin) {
      throw new ForbiddenException('Solo un usuario Administrador puede desactivar asignaciones de aprobación.');
    }

    // 2. Validar que la asignación exista
    const assignment = await this.prisma.asignacionAprobador.findUnique({
      where: { idAsignacionAprobador: id }
    });

    if (!assignment) {
      throw new NotFoundException(`La asignación con id ${id} no existe.`);
    }

    // 3. Desactivación lógica (soft delete)
    await this.prisma.asignacionAprobador.update({
      where: { idAsignacionAprobador: id },
      data: { activo: false }
    });

    return { message: 'Asignación de aprobador desactivada exitosamente.' };
  }
}
