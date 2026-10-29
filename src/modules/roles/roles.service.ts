import {
    HttpException,
    Injectable,
    Logger,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

// La BD puede estar remota (VPN), asi que la transaccion interactiva lleva un
// timeout explicito por encima del default de 5 s de Prisma.
const OPCIONES_TRANSACCION = {
    maxWait: 15_000,
    timeout: 20_000,
};

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

    // Los errores internos de Prisma no deben llegar al cliente (exponen rutas
    // locales y detalles de la BD): se registran completos aqui y se responde
    // con un 500 generico en el formato del proyecto. Solo aplica a este modulo;
    // el filtro global del proyecto no se modifica para no afectar a otros modulos.
    private errorInterno(error: unknown, contexto: string, mensaje: string, code: string): HttpException {
        this.logger.error(`${contexto} | ${error instanceof Error ? error.stack : String(error)}`);

        return new HttpException(
            {
                message: mensaje,
                error: 'Internal Server Error',
                code,
            },
            500,
        );
    }

    async findAll(user: ActiveUserDto) {
        try {
            return await this.prismaService.catRoles.findMany({
                where: {
                    activo: true,
                    idTenant: user.idTenant,
                },
                include: this.permisosActivosInclude(user.idTenant),
            });
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw this.errorInterno(
                error,
                `findAll | tenant=${user.idTenant}`,
                'Ocurrio un error inesperado. Intenta de nuevo.',
                'ERROR_INTERNO',
            );
        }
    }

    async findOne(user: ActiveUserDto, id: number) {
        try {
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
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw this.errorInterno(
                error,
                `findOne | rol=${id} | tenant=${user.idTenant}`,
                'Ocurrio un error inesperado. Intenta de nuevo.',
                'ERROR_INTERNO',
            );
        }
    }

    async update(user: ActiveUserDto, id: number, dto: UpdateRoleDto) {
        const idTenant = user.idTenant;
        const idsModulo = dto.permisos.map((permiso) => permiso.idModulo);

        try {
            const { rolActualizado, resumen } = await this.prismaService.$transaction(
                async (tx) => {
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

                    // Trae todas las filas del rol (no solo las del payload) en una sola
                    // consulta: sirve para comparar el estado previo, detectar los modulos
                    // removidos y evitar el updateMany cuando no hay nada que desactivar.
                    const existentes = await tx.relRolPermisos.findMany({
                        where: {
                            idRol: id,
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
                    const conjuntoPayload = new Set(idsModulo);

                    let agregados = 0;
                    let modificados = 0;
                    let reactivados = 0;

                    // Solo se escribe lo que cambio: los modulos identicos al estado
                    // previo no generan consulta.
                    for (const permiso of dto.permisos) {
                        const registroActual = mapaExistente.get(permiso.idModulo);
                        const sinCambios =
                            registroActual !== undefined &&
                            registroActual.activo &&
                            registroActual.puedeVer === permiso.ver &&
                            registroActual.puedeCrear === permiso.crear &&
                            registroActual.puedeActualizar === permiso.editar &&
                            registroActual.puedeEliminar === permiso.eliminar;

                        if (sinCambios) {
                            continue;
                        }

                        if (!registroActual) {
                            agregados += 1;
                        } else if (!registroActual.activo) {
                            reactivados += 1;
                        } else {
                            modificados += 1;
                        }

                        const data = {
                            idTenant,
                            puedeVer: permiso.ver,
                            puedeCrear: permiso.crear,
                            puedeActualizar: permiso.editar,
                            puedeEliminar: permiso.eliminar,
                            activo: true,
                        };

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

                    // Un solo updateMany para todos los removidos, y solo si existe
                    // al menos un modulo activo ausente del payload.
                    let desactivados = 0;
                    const hayRemovidos = existentes.some(
                        (registro) => registro.activo && !conjuntoPayload.has(registro.idModulo),
                    );

                    if (hayRemovidos) {
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
                        desactivados = permisosDesactivados.count;
                    }

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
                            desactivados,
                        },
                    };
                },
                OPCIONES_TRANSACCION,
            );

            this.logger.log(
                `Permisos de rol actualizados | usuario=${user.id} | rol=${id} | tenant=${idTenant} | fecha=${new Date().toISOString()} | resumen=${JSON.stringify(resumen)}`,
            );

            return rolActualizado;
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw this.errorInterno(
                error,
                `update | rol=${id} | tenant=${idTenant} | usuario=${user.id}`,
                'No se pudieron actualizar los permisos del rol. Intenta de nuevo.',
                'ERROR_ACTUALIZAR_PERMISOS',
            );
        }
    }
}
