import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

const MODULO_ROLEPLAYS = 'ai-roleplays';

// Quién puede practicar un roleplay y quién puede ver cada llamada
@Injectable()
export class RoleplayAccessService {
    constructor(private readonly prisma: PrismaService) { }

    tenantDe(user: ActiveUserDto): number {
        if (!user.idTenant) {
            throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
        }
        return user.idTenant;
    }

    // Empleados.idUsuario guarda el uuid de auth_user
    async findEmployeeId(companyId: number, user: ActiveUserDto): Promise<number | null> {
        if (!user.uuid) return null;
        const empleado = await this.prisma.empleados.findFirst({
            where: { idUsuario: user.uuid, idEmpresa: companyId, idTenant: this.tenantDe(user), activo: true },
            select: { idEmpleado: true },
        });
        return empleado?.idEmpleado ?? null;
    }

    // Permiso de actualizar en el módulo de roleplays (RH / Admin)
    async canManage(user: ActiveUserDto): Promise<boolean> {
        const roles = await this.prisma.relUsuarioRol.findMany({
            where: { idUsuario: user.id, activo: true },
            select: { idRol: true },
        });
        if (!roles.length) return false;
        const permiso = await this.prisma.relRolPermisos.findFirst({
            where: {
                idRol: { in: roles.map((r) => r.idRol) },
                activo: true,
                puedeActualizar: true,
                CatModulos: { Codigo: MODULO_ROLEPLAYS },
            },
            select: { id: true },
        });
        return !!permiso;
    }

    async assertCanStart(companyId: number, roleplayId: number, user: ActiveUserDto) {
        const idTenant = this.tenantDe(user);
        const roleplay = await this.prisma.rolePlays.findFirst({
            where: { idRolePlay: roleplayId, idEmpresa: companyId, idTenant },
            select: { Activo: true },
        });
        if (!roleplay) {
            throw new NotFoundException('El role play no existe.');
        }
        if (await this.canManage(user)) return;
        if (!roleplay.Activo) {
            throw new BadRequestException('Este role play está inactivo.');
        }

        const idEmpleado = await this.findEmployeeId(companyId, user);
        const asignacion = idEmpleado
            ? await this.prisma.rolePlayAsignaciones.findFirst({
                where: { idRolePlay: roleplayId, idEmpleado, idTenant, Activo: true },
                select: { FechaRegistro: true, FechaLimite: true, IntentosMaximos: true },
            })
            : null;
        if (!asignacion) {
            throw new ForbiddenException('No tienes asignado este role play.');
        }
        if (asignacion.FechaLimite && new Date() > asignacion.FechaLimite) {
            throw new BadRequestException('La fecha límite para practicar este role play ya pasó.');
        }
        if (asignacion.IntentosMaximos !== null) {
            const usados = await this.prisma.rolePlayLlamadas.count({
                where: {
                    idRolePlay: roleplayId,
                    idUsuario: user.id,
                    idTenant,
                    ...(asignacion.FechaRegistro ? { FechaRegistro: { gte: asignacion.FechaRegistro } } : {}),
                },
            });
            if (usados >= asignacion.IntentosMaximos) {
                throw new BadRequestException(`Ya usaste tus ${asignacion.IntentosMaximos} intento(s) de este role play.`);
            }
        }
    }

    // soloDueno: conversar y finalizar solo los hace quien inició la llamada
    async assertCallAccess(companyId: number, idLlamada: number, user: ActiveUserDto, soloDueno = false) {
        const llamada = await this.prisma.rolePlayLlamadas.findFirst({
            where: { idLlamada, idEmpresa: companyId, idTenant: this.tenantDe(user) },
            select: { idLlamada: true, idUsuario: true, Estatus: true },
        });
        if (!llamada) {
            throw new NotFoundException('La sesión de práctica no existe.');
        }
        if (llamada.idUsuario === user.id) return llamada;
        if (!soloDueno && (await this.canManage(user))) return llamada;
        throw new ForbiddenException('No tienes acceso a esta sesión de práctica.');
    }
}
