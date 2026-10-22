import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
    private readonly logger = new Logger(RolesService.name);

    constructor(private readonly prismaService: PrismaService) { }

    private permisosActivosInclude(idTenant: number): Prisma.CatRolesInclude {
        return {
            RelRolPermisos: {
                where: {
                    activo: true,
                    idTenant,
                    CatModulos: {
                        Activo: true,
                        idTenant,
                    },
                },
                include: {
                    CatModulos: true,
                },
            },
        };
    }

    async findAll(user: ActiveUserDto) {
        return await this.prismaService.catRoles.findMany({
            where: {
                activo: true,
                idTenant: user.idTenant,
            },
            include: this.permisosActivosInclude(user.idTenant),
        });
    }

    async findOne(user: ActiveUserDto, id: number) {
        const rol = await this.prismaService.catRoles.findUnique({
            where: {
                idRol: id,
                idTenant: user.idTenant,
            },
            include: this.permisosActivosInclude(user.idTenant),
        });

        if (!rol) {
            throw new NotFoundException('Rol no encontrado o no pertenece a tu empresa.');
        }

        return rol;
    }

    async update(user: ActiveUserDto, id: number, dto: UpdateRoleDto) {
        const idTenant = user.idTenant;
        const idsModulo = dto.permisos.map((permiso) => permiso.idModulo);

        const { rolActualizado, resumen } = await this.prismaService.$transaction(async (tx) => {
            const rol = await tx.catRoles.findUnique({
                where: {
                    idRol: id,
                    idTenant,
                },
            });

            if (!rol) {
                throw new NotFoundException('Rol no encontrado o no pertenece a tu empresa.');
            }

            const modulosValidos = await tx.catModulos.findMany({
                where: {
                    idModulo: { in: idsModulo },
                    Activo: true,
                    idTenant,
                },
                select: {
                    idModulo: true,
                },
            });
            const conjuntoValidos = new Set(modulosValidos.map((modulo) => modulo.idModulo));
            const idModulosRechazados = idsModulo.filter((idModulo) => !conjuntoValidos.has(idModulo));

            if (idModulosRechazados.length > 0) {
                throw new UnprocessableEntityException({
                    message: 'Uno o mas modulos no estan disponibles para este rol.',
                    code: 'MODULOS_INVALIDOS',
                    detail: { idModulosRechazados },
                });
            }

            const permisosSinVer = dto.permisos
                .filter((permiso) => !permiso.ver && (permiso.crear || permiso.editar || permiso.eliminar))
                .map((permiso) => permiso.idModulo);

            if (permisosSinVer.length > 0) {
                throw new UnprocessableEntityException({
                    message: 'Los permisos para crear, editar o eliminar requieren tambien el permiso de ver.',
                    code: 'VER_REQUERIDO',
                    detail: { idModulos: permisosSinVer },
                });
            }

            const existentes = await tx.relRolPermisos.findMany({
                where: {
                    idRol: id,
                    idModulo: { in: idsModulo },
                },
                select: {
                    idModulo: true,
                    puedeVer: true,
                    puedeCrear: true,
                    puedeActualizar: true,
                    puedeEliminar: true,
                    activo: true,
                },
            });
            const mapaExistente = new Map(existentes.map((registro) => [registro.idModulo, registro]));

            let agregados = 0;
            let modificados = 0;
            let reactivados = 0;

            for (const permiso of dto.permisos) {
                const registroActual = mapaExistente.get(permiso.idModulo);
                const data = {
                    idTenant,
                    puedeVer: permiso.ver,
                    puedeCrear: permiso.crear,
                    puedeActualizar: permiso.editar,
                    puedeEliminar: permiso.eliminar,
                    activo: true,
                };

                if (!registroActual) {
                    agregados += 1;
                } else if (!registroActual.activo) {
                    reactivados += 1;
                } else if (
                    registroActual.puedeVer !== permiso.ver ||
                    registroActual.puedeCrear !== permiso.crear ||
                    registroActual.puedeActualizar !== permiso.editar ||
                    registroActual.puedeEliminar !== permiso.eliminar
                ) {
                    modificados += 1;
                }

                await tx.relRolPermisos.upsert({
                    where: { idRol_idModulo: { idRol: id, idModulo: permiso.idModulo } },
                    create: {
                        idRol: id,
                        idModulo: permiso.idModulo,
                        ...data,
                    },
                    update: data,
                });
            }

            const permisosDesactivados = await tx.relRolPermisos.updateMany({
                where: {
                    idRol: id,
                    activo: true,
                    ...(idsModulo.length > 0 ? { idModulo: { notIn: idsModulo } } : {}),
                },
                data: {
                    activo: false,
                },
            });

            if (dto.rol?.descripcion !== undefined) {
                await tx.catRoles.update({
                    where: {
                        idRol: id,
                    },
                    data: {
                        descripcion: dto.rol.descripcion,
                    },
                });
            }

            const rolConPermisos = await tx.catRoles.findUnique({
                where: {
                    idRol: id,
                    idTenant,
                },
                include: this.permisosActivosInclude(idTenant),
            });

            if (!rolConPermisos) {
                throw new NotFoundException('Rol no encontrado o no pertenece a tu empresa.');
            }

            return {
                rolActualizado: rolConPermisos,
                resumen: {
                    agregados,
                    modificados,
                    reactivados,
                    desactivados: permisosDesactivados.count,
                },
            };
        });

        this.logger.log(
            `Permisos de rol actualizados | usuario=${user.id} | rol=${id} | tenant=${idTenant} | fecha=${new Date().toISOString()} | resumen=${JSON.stringify(resumen)}`,
        );

        return rolActualizado;
    }
}
