import { Injectable, NotFoundException, BadRequestException, Logger, UnauthorizedException, Inject, forwardRef, ConsoleLogger } from '@nestjs/common';
import { ActionApprovalDto } from './dto/approve-reject-action.dto';
import { ModuloOrigenEnum, AccionAprobacionEnum, AccionCancelacionEnum } from './enums/approval-origin.enum';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { PersonnelConfigService } from '../config/personnel-config/personnel-config.service';
import { GetApprovalRequestDetailDto } from './dto/get-approval-request-detail.dto';
import { obtenerIniciales } from './utils/approvals.utils';
import { IncidentsService } from '../incidents/incidents.service';
import { CancelApprovalDto } from './dto/cancel-action.dto';
import { InternalMovementsService } from '../internal-movements/internal-movements.service';

@Injectable()
export class ApprovalsService {
    private readonly logger = new Logger(ApprovalsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly personnelConfig: PersonnelConfigService,
        private readonly incidentsService: IncidentsService,
        @Inject(forwardRef(() => InternalMovementsService))
        private readonly internalMovementsService: InternalMovementsService,
    ) { }

    // BANDEJA UNIFICADA: Listado de pendientes que requieren la aprobación del usuario
    async getPendingApprovals(activeUser: ActiveUserDto, companyId: number) {
        try {
            // A. Obtener empleado vinculado al usuario
            const currentEmployee = await this.prisma.empleados.findFirst({
                where: {
                    idTenant: activeUser.idTenant,
                    idEmpresa: companyId,
                    idUsuario: activeUser.uuid,
                    activo: true,
                },
                select: { idEmpleado: true, idPuesto: true },
            });
            const currentEmployeeId = currentEmployee?.idEmpleado ?? null;

            // B. Obtener roles del usuario
            const userRolesRaw = await this.prisma.relUsuarioRol.findMany({
                where: { idUsuario: (activeUser as any).id ?? activeUser.uuid },
                select: { idRol: true },
            });
            const currentUserRoleIds = new Set<number>(userRolesRaw.map((r) => r.idRol));

            // Cache local de configuraciones de flujo
            const flujosCache = new Map<number, any>();

            const obtenerFlujoConfig = async (idTipoMov: number) => {
                if (!flujosCache.has(idTipoMov)) {
                    try {
                        const flujo = await this.personnelConfig.obtenerFlujoPorTipoMovimiento(
                            activeUser.idTenant,
                            companyId,
                            idTipoMov,
                        );

                        flujosCache.set(idTipoMov, flujo);
                    } catch (error) {
                        // Si no existe un flujo configurado, se ignora este tipo de movimiento.
                        if (error instanceof NotFoundException) {
                            this.logger.warn(`Se ignora el tipo de movimiento ${idTipoMov}: no tiene flujo de aprobación configurado.`,);
                            flujosCache.set(idTipoMov, null);
                        } else {
                            // Los errores distintos a la ausencia de flujo deben seguir reportándose.
                            throw error;
                        }
                    }
                }

                return flujosCache.get(idTipoMov);
            };

            // ----------------------------------------------------
            // C. Consultar INCIDENCIAS pendientes
            // ----------------------------------------------------
            const incidencias = await this.prisma.solicitudesIncidencias.findMany({
                where: {
                    idTenant: activeUser.idTenant,
                    idEmpresa: companyId,
                    estatus: 'PENDIENTE',
                },
                include: {
                    Empleados_SolicitudesIncidencias_idEmpleadoToEmpleados: {
                        select: {
                            idEmpleado: true,
                            nombre: true,
                            primerApellido: true,
                            segundoApellido: true,
                            idJefeInmediato: true,
                            CatPuestos: { select: { idPuesto: true, idArea: true } },
                            Empleados: { select: { idEmpleado: true, idJefeInmediato: true } },
                        },
                    },
                    CatTipoMovimiento: true,
                },
                orderBy: { fechaRegistro: 'desc' },
            });

            const pendientesIncidencias: any[] = [];

            for (const inc of incidencias) {
                const flujo = await obtenerFlujoConfig(inc.idTipoMovimiento);

                // Si no tiene flujo configurado o no tiene pasos, se ignora.
                if (!flujo?.pasos?.length) continue;

                const pasoNum = (inc as any).pasoActual ?? 1;
                const pasoConfig = flujo.pasos.find((p: any) => p.paso === pasoNum);
                if (!pasoConfig) continue;

                const solicitante = (inc as any).Empleados_SolicitudesIncidencias_idEmpleadoToEmpleados;
                if (!solicitante) continue;

                const puedeAprobar = this.validarPermisoPaso({
                    pasoConfig,
                    solicitante,
                    currentEmployeeId,
                    currentUserRoleIds,
                    activeUser,
                });

                if (puedeAprobar) {
                    const nombreCompleto = [
                        solicitante.nombre,
                        solicitante.primerApellido,
                        solicitante.segundoApellido,
                    ]
                        .filter(Boolean)
                        .join(' ');

                    pendientesIncidencias.push({
                        idOrigen: inc.idSolicitud,
                        origenModulo: ModuloOrigenEnum.INCIDENCIA,
                        idEmpleado: solicitante.idEmpleado,
                        empleadoNombreCompleto: nombreCompleto,
                        empleadoIniciales: obtenerIniciales(
                            solicitante.nombre,
                            solicitante.primerApellido,
                        ),
                        comentarioOMotivo: inc.comentarios || null,
                        idTipoMovimiento: inc.idTipoMovimiento,
                        tipoMovimientoNombre: inc.CatTipoMovimiento?.nombre || 'Incidencia',
                        codigoTipoSolicitud: inc.CatTipoMovimiento?.codigo || 'INCIDENCIA',
                        estatusCodigo: `PENDIENTE_PASO_${pasoNum}`,
                        estatusNombre: `PENDIENTE (${pasoConfig.nombreRol || pasoConfig.tipoAprobador})`,
                        pasoActual: pasoNum,
                        totalPasos: flujo.totalPasos || flujo.pasos.length,
                        fechaSolicitud: inc.fechaRegistro,
                        requiereMiAprobacion: true,
                    });
                }
            }

            // ----------------------------------------------------
            // D. Consultar MOVIMIENTOS INTERNOS pendientes
            // ----------------------------------------------------
            const movimientos = await this.prisma.movimientosInternos.findMany({
                where: {
                    idTenant: activeUser.idTenant,
                    idEmpresa: companyId,
                    estatus: 'PENDIENTE',
                },
                orderBy: { fechaRegistro: 'desc' },
            });

            const pendientesMovimientos: any[] = [];
            const empleadosCache = new Map<number, any>();
            const tiposMovimientoCache = new Map<number, any>();

            for (const mov of movimientos) {
                // Obtener el tipo de movimiento mediante su ID
                let tipoMovimiento = tiposMovimientoCache.get(mov.idTipoMovimiento);

                if (tipoMovimiento === undefined) {
                    tipoMovimiento = await this.prisma.catTipoMovimiento.findUnique({
                        where: { idTipoMovimiento: mov.idTipoMovimiento },
                    });
                    tiposMovimientoCache.set(mov.idTipoMovimiento, tipoMovimiento ?? null);
                }
                if (!tipoMovimiento) continue;

                const flujo = await obtenerFlujoConfig(mov.idTipoMovimiento);
                if (!flujo?.pasos?.length) continue;

                const pasoNum = mov.pasoActual ?? 1;
                const pasoConfig = flujo.pasos.find((p: any) => p.paso === pasoNum);
                if (!pasoConfig) continue;

                // Obtener al empleado que realizó la solicitud
                const idSolicitante = mov.idEmpleado;
                let solicitante = empleadosCache.get(idSolicitante);

                if (solicitante === undefined) {
                    solicitante = await this.prisma.empleados.findUnique({
                        where: { idEmpleado: idSolicitante },
                        select: {
                            idEmpleado: true,
                            nombre: true,
                            primerApellido: true,
                            segundoApellido: true,
                            idJefeInmediato: true,
                            CatPuestos: { select: { idPuesto: true, idArea: true } },
                            Empleados: { select: { idEmpleado: true, idJefeInmediato: true } },
                        },
                    });
                    empleadosCache.set(idSolicitante, solicitante ?? null);
                }

                if (!solicitante) continue;

                const puedeAprobar = this.validarPermisoPaso({
                    pasoConfig,
                    solicitante,
                    currentEmployeeId,
                    currentUserRoleIds,
                    activeUser,
                });

                if (!puedeAprobar) continue;

                const nombreCompleto = [
                    solicitante.nombre,
                    solicitante.primerApellido,
                    solicitante.segundoApellido,
                ].filter(Boolean).join(' ');

                pendientesMovimientos.push({
                    idOrigen: mov.idMovimiento,
                    origenModulo: ModuloOrigenEnum.MOVIMIENTO_INTERNO,
                    idEmpleado: mov.idEmpleado,
                    empleadoNombreCompleto: nombreCompleto,
                    empleadoIniciales: obtenerIniciales(
                        solicitante.nombre || '',
                        solicitante.primerApellido || '',
                    ),
                    comentarioOMotivo: mov.motivo || null,
                    idTipoMovimiento: mov.idTipoMovimiento,
                    tipoMovimientoNombre: tipoMovimiento.nombre || 'Movimiento Interno',
                    codigoTipoSolicitud: tipoMovimiento.codigo || 'MOVIMIENTO_INTERNO',
                    estatusCodigo: `PENDIENTE_PASO_${pasoNum}`,
                    estatusNombre: `PENDIENTE (${pasoConfig.nombreRol || pasoConfig.tipoAprobador})`,
                    pasoActual: pasoNum,
                    totalPasos: flujo.totalPasos || flujo.pasos.length,
                    fechaSolicitud: mov.fechaRegistro,
                    requiereMiAprobacion: true,
                });
            }

            // ----------------------------------------------------
            // E. Unificar y ordenar por fecha más reciente
            // ----------------------------------------------------
            const all = [...pendientesIncidencias, ...pendientesMovimientos].sort(
                (a, b) =>
                    new Date(b.fechaSolicitud).getTime() -
                    new Date(a.fechaSolicitud).getTime(),
            );

            return {
                count: all.length,
                requests: all,
            };
        } catch (error) {
            console.error('ERROR EN getPendingApprovals:', error);
            throw error;
        }
    }

    /**
     * 2. MOTOR REUTILIZABLE: Evalúa si el usuario cumple la regla del paso
     */
    private validarPermisoPaso(params: {
        pasoConfig: any;
        solicitante: any;
        currentEmployeeId: number | null;
        currentUserRoleIds: Set<number>;
        activeUser: ActiveUserDto;
    }): boolean {
        const { pasoConfig, solicitante, currentEmployeeId, currentUserRoleIds, activeUser } = params;

        switch (pasoConfig.tipoAprobador) {
            case 'JERARQUIA': {
                if (!currentEmployeeId) return false;
                if (pasoConfig.nivelJerarquia === 1) {
                    return solicitante.idJefeInmediato === currentEmployeeId;
                } else if (pasoConfig.nivelJerarquia === 2) {
                    return solicitante.Empleados?.idJefeInmediato === currentEmployeeId;
                }
                return false;
            }

            case 'ROL': {
                if (pasoConfig.modoAsignacionRol === 'ESPECIFICO') {
                    return (
                        pasoConfig.idUsuarioFijoRol === currentEmployeeId ||
                        pasoConfig.idUsuarioFijoRol?.toString() === (activeUser as any).id?.toString() ||
                        pasoConfig.idUsuarioFijoRol?.toString() === activeUser.uuid
                    );
                }
                return currentUserRoleIds.has(Number(pasoConfig.idRolAprobador));
            }


            case 'AREA': {
                // Área a la que pertenece el empleado que genera la solicitud.
                const idAreaSolicitante = solicitante.CatPuestos?.idArea;

                if (
                    idAreaSolicitante == null ||
                    !Array.isArray(pasoConfig.directoresPorArea)
                ) {
                    return false;
                }

                // Buscar quién tiene autorización para el área del solicitante.
                const configArea = pasoConfig.directoresPorArea.find(
                    (director: any) =>
                        Number(director.idArea) === Number(idAreaSolicitante),
                );

                if (!configArea || configArea.idUsuarioDirector == null) {
                    return false;
                }

                // Comparar contra el identificador del usuario autenticado.
                const idUsuarioActual = String(
                    (activeUser as any).id ?? '',
                );

                const uuidUsuarioActual = String(activeUser.uuid ?? '');

                const idUsuarioDirector = String(configArea.idUsuarioDirector);

                return (
                    idUsuarioDirector === idUsuarioActual ||
                    idUsuarioDirector === uuidUsuarioActual
                );
            }


            default:
                return false;
        }
    }

    // ACCIÓN UNIFICADA: Aprobar o Rechazar cualquier solicitud
    async processApprovalAction(
        activeUser: ActiveUserDto,
        companyId: number,
        dto: ActionApprovalDto,
    ) {
        // A. Obtener empleado del usuario actual
        const currentEmployee = await this.prisma.empleados.findFirst({
            where: {
                idTenant: activeUser.idTenant,
                idEmpresa: companyId,
                idUsuario: activeUser.uuid,
                activo: true,
            },
            select: { idEmpleado: true },
        });
        const currentEmployeeId = currentEmployee?.idEmpleado ?? null;

        // B. Manejo para INCIDENCIAS
        if (dto.origenModulo === ModuloOrigenEnum.INCIDENCIA) {
            const solicitud = await this.prisma.solicitudesIncidencias.findFirst({
                where: {
                    idSolicitud: dto.idOrigen,
                    idEmpresa: companyId,
                    idTenant: activeUser.idTenant,
                },
            });

            if (!solicitud) throw new NotFoundException('La solicitud de incidencia no existe');
            if (solicitud.estatus !== 'PENDIENTE') {
                throw new BadRequestException('La solicitud ya no se encuentra en estatus pendiente');
            }

            const flujo = await this.personnelConfig.obtenerFlujoPorTipoMovimiento(
                activeUser.idTenant,
                companyId,
                solicitud.idTipoMovimiento,
            );

            const pasoActual = (solicitud as any).pasoActual ?? 1;
            const totalPasos = flujo.totalPasos || flujo.pasos.length;
            const pasoConfig = flujo.pasos.find((p: any) => p.paso === pasoActual);

            // Registrar auditoría en la nueva tabla PasosAprobacionIncidencia
            return await this.prisma.$transaction(async (tx) => {
                const estatusPaso = dto.accion === AccionAprobacionEnum.APROBAR ? 'APROBADA' : 'RECHAZADA';

                await tx.pasosAprobacionIncidencia.create({
                    data: {
                        idSolicitud: solicitud.idSolicitud,
                        paso: pasoActual,
                        tipoAprobador: pasoConfig?.tipoAprobador || 'ROL',
                        idRolAprobador: pasoConfig?.idRolAprobador ?? null,
                        estatus: estatusPaso,
                        idUsuarioAprobador: activeUser.uuid,
                        idEmpleadoAprobador: currentEmployeeId,
                        comentarios: dto.comentarios || null,
                        fechaRespuesta: new Date(),
                    },
                });

                if (dto.accion === AccionAprobacionEnum.RECHAZAR) {
                    await tx.solicitudesIncidencias.update({
                        where: { idSolicitud: solicitud.idSolicitud },
                        data: {
                            estatus: 'RECHAZADA',
                            motivoRechazo: dto.comentarios || 'Rechazado en el flujo de aprobación',
                            idAprobador: currentEmployeeId,
                            fechaRespuesta: new Date(),
                        },
                    });
                    return { message: 'Solicitud rechazada exitosamente' };
                }

                // Si aprobó: verificamos si era el último paso o pasa al siguiente
                if (pasoActual >= totalPasos) {
                    await tx.solicitudesIncidencias.update({
                        where: { idSolicitud: solicitud.idSolicitud },
                        data: {
                            estatus: 'APROBADA',
                            idAprobador: currentEmployeeId,
                            fechaRespuesta: new Date(),
                        },
                    });
                    return { message: 'Solicitud aprobada y finalizada con éxito' };
                } else {
                    await tx.solicitudesIncidencias.update({
                        where: { idSolicitud: solicitud.idSolicitud },
                        data: {
                            pasoActual: pasoActual + 1,
                        },
                    });
                    return { message: `Aprobado el paso ${pasoActual}. Pasa al paso ${pasoActual + 1}` };
                }
            });
        }

        // C. Manejo para MOVIMIENTOS INTERNOS
        if (dto.origenModulo === ModuloOrigenEnum.MOVIMIENTO_INTERNO) {
            const solicitud = await this.prisma.movimientosInternos.findFirst({
                where: {
                    idMovimiento: dto.idOrigen,
                    idEmpresa: companyId,
                    idTenant: activeUser.idTenant,
                },
            });

            if (!solicitud) throw new NotFoundException('El movimiento interno no existe');
            if (solicitud.estatus !== 'PENDIENTE') {
                throw new BadRequestException('El movimiento interno ya no se encuentra en estatus pendiente');
            }

            const flujo = await this.personnelConfig.obtenerFlujoPorTipoMovimiento(
                activeUser.idTenant,
                companyId,
                solicitud.idTipoMovimiento,
            );

            const pasoActual = (solicitud as any).pasoActual ?? 1;
            const totalPasos = flujo.totalPasos || flujo.pasos.length;
            const pasoConfig = flujo.pasos.find((p: any) => p.paso === pasoActual);

            // Registrar auditoría en la nueva tabla PasosAprobacionMovimiento
            return await this.prisma.$transaction(async (tx) => {
                const estatusPaso = dto.accion === AccionAprobacionEnum.APROBAR ? 'APROBADA' : 'RECHAZADA';

                await tx.pasosAprobacionMovimientoInterno.create({
                    data: {
                        idMovimiento: solicitud.idMovimiento,
                        paso: pasoActual,
                        tipoAprobador: pasoConfig?.tipoAprobador || 'ROL',
                        idRolAprobador: pasoConfig?.idRolAprobador ?? null,
                        estatus: estatusPaso,
                        idUsuarioAprobador: activeUser.uuid,
                        idEmpleadoAprobador: currentEmployeeId,
                        comentarios: dto.comentarios || null,
                        fechaRespuesta: new Date(),
                    },
                });

                if (dto.accion === AccionAprobacionEnum.RECHAZAR) {
                    await tx.movimientosInternos.update({
                        where: { idMovimiento: solicitud.idMovimiento },
                        data: {
                            estatus: 'RECHAZADA',
                            motivoRechazo: dto.comentarios || 'Rechazado en el flujo de aprobación',
                            idAprobador: currentEmployeeId,
                            fechaRespuesta: new Date(),
                        },
                    });
                    return { message: 'Solicitud rechazada exitosamente' };
                }

                // Si aprobó: verificamos si era el último paso o pasa al siguiente
                if (pasoActual >= totalPasos) {
                    await tx.movimientosInternos.update({
                        where: { idMovimiento: solicitud.idMovimiento },
                        data: {
                            estatus: 'APROBADA',
                            idAprobador: currentEmployeeId,
                            fechaRespuesta: new Date(),
                        },
                    });

                    // Actualizamos la información del empleado que se aprobó
                    await this.internalMovementsService.aplicarMovimientoAEmpleado(solicitud.idMovimiento, activeUser);

                    return { message: 'Solicitud aprobada y finalizada con éxito' };
                } else {
                    await tx.movimientosInternos.update({
                        where: { idMovimiento: solicitud.idMovimiento },
                        data: {
                            pasoActual: pasoActual + 1,
                        },
                    });
                    return { message: `Aprobado el paso ${pasoActual}. Pasa al paso ${pasoActual + 1}` };
                }
            });
        }

        throw new BadRequestException('Módulo de origen no reconocido');
    }

    // Esta función cancela una solicitud por el solicitante o el solicitado
    async cancelRequest(
        activeUser: ActiveUserDto,
        companyId: number,
        dto: CancelApprovalDto,
    ) {
        // A. Obtener el empleado asociado al usuario autenticado
        const currentEmployee = await this.prisma.empleados.findFirst({
            where: {
                idTenant: activeUser.idTenant,
                idEmpresa: companyId,
                idUsuario: activeUser.uuid,
                activo: true,
            },
            select: {
                idEmpleado: true,
            },
        });

        const currentEmployeeId = currentEmployee?.idEmpleado ?? null;

        if (!currentEmployeeId) {
            throw new UnauthorizedException(
                'El usuario autenticado no tiene un empleado asociado.',
            );
        }

        // B. Manejo para INCIDENCIAS
        if (dto.origenModulo === ModuloOrigenEnum.INCIDENCIA) {
            const solicitud =
                await this.prisma.solicitudesIncidencias.findFirst({
                    where: {
                        idSolicitud: dto.idOrigen,
                        idTenant: activeUser.idTenant,
                        idEmpresa: companyId,

                        // El usuario debe ser:
                        // 1. El empleado para quien se creó la solicitud, o
                        // 2. El empleado que realizó la solicitud.
                        OR: [
                            {
                                idEmpleado: currentEmployeeId,
                            },
                            {
                                solicitadoPorIdEmpleado: currentEmployeeId,
                            },
                        ],
                    },
                    select: {
                        idSolicitud: true,
                        idEmpleado: true,
                        solicitadoPorIdEmpleado: true,
                        estatus: true,
                        comentarios: true,
                    },
                });

            /*
             * Si no existe o no pertenece al usuario actual,
             * devolvemos 404 para no revelar información sobre
             * solicitudes de otros empleados.
             */
            if (!solicitud) {
                throw new NotFoundException(
                    'La solicitud de incidencia no existe.',
                );
            }

            // C. Solo se puede cancelar una solicitud pendiente
            if (solicitud.estatus !== 'PENDIENTE') {
                throw new BadRequestException(
                    'La solicitud ya no se encuentra en estatus pendiente y no puede ser cancelada.',
                );
            }

            // D. Validar que la acción solicitada sea CANCELAR
            if (dto.accion !== AccionCancelacionEnum.CANCELAR) {
                throw new BadRequestException(
                    'La acción de cancelación no es válida.',
                );
            }

            // E. Validar el motivo de cancelación
            const comentario = dto.comentarios?.trim();

            if (!comentario) {
                throw new BadRequestException(
                    'Debes indicar el motivo de la cancelación.',
                );
            }

            // F. Cancelar la solicitud
            await this.prisma.$transaction(async (tx) => {
                await tx.solicitudesIncidencias.update({
                    where: {
                        idSolicitud: solicitud.idSolicitud,
                    },
                    data: {
                        estatus: 'CANCELADA',
                        motivoRechazo: comentario,
                        fechaRespuesta: new Date(),
                    },
                });
            });

            return {
                message: 'Solicitud cancelada exitosamente',
                idOrigen: solicitud.idSolicitud,
                estatus: 'CANCELADA',
            };
        }

        // G. Manejo para MOVIMIENTOS INTERNOS
        if (dto.origenModulo === ModuloOrigenEnum.MOVIMIENTO_INTERNO) {
            const solicitud =
                await this.prisma.movimientosInternos.findFirst({
                    where: {
                        idMovimiento: dto.idOrigen,
                        idTenant: activeUser.idTenant,
                        idEmpresa: companyId,
                    },
                    select: {
                        idMovimiento: true,
                        idEmpleado: true,
                        solicitadoPorIdEmpleado: true,
                        estatus: true,
                        motivo: true,
                    },
                });

            if (!solicitud) {
                throw new NotFoundException(
                    'El movimiento interno no existe.',
                );
            }

            // C. Solo se puede cancelar una solicitud pendiente
            if (solicitud.estatus !== 'PENDIENTE') {
                throw new BadRequestException(
                    'El movimiento interno ya no se encuentra en estatus pendiente y no puede ser cancelado.',
                );
            }

            // D. Validar que la acción solicitada sea CANCELAR
            if (dto.accion !== AccionCancelacionEnum.CANCELAR) {
                throw new BadRequestException(
                    'La acción de cancelación no es válida.',
                );
            }

            // E. Validar el motivo de cancelación
            const comentario = dto.comentarios?.trim();

            if (!comentario) {
                throw new BadRequestException(
                    'Debes indicar el motivo de la cancelación.',
                );
            }

            // F. Cancelar la solicitud
            await this.prisma.$transaction(async (tx) => {
                await tx.movimientosInternos.update({
                    where: {
                        idMovimiento: solicitud.idMovimiento,
                    },
                    data: {
                        estatus: 'CANCELADA',
                        motivoRechazo: comentario,
                        fechaRespuesta: new Date(),
                    },
                });
            });

            return {
                message: 'Movimiento interno cancelado exitosamente',
                idOrigen: solicitud.idMovimiento,
                estatus: 'CANCELADA',
            };
        }

        throw new BadRequestException(
            'Módulo de origen no reconocido.',
        );
    }

    async getApprovalRequestDetail(
        activeUser: ActiveUserDto,
        companyId: number,
        query: GetApprovalRequestDetailDto,
    ) {
        // 1. Reutilizar la lógica existente de autorización.
        const pendingResponse = await this.getPendingApprovals(
            activeUser,
            companyId,
        );

        const request = pendingResponse.requests.find(
            (item) =>
                item.origenModulo === query.origenModulo &&
                item.idOrigen === query.idOrigen &&
                item.requiereMiAprobacion === true,
        );

        if (!request) {
            // No revelar si existe una solicitud que el usuario
            // no tiene permiso para consultar.
            throw new NotFoundException(
                'La solicitud no existe o no tienes permiso para consultarla.',
            );
        }

        // 2. Consultar los detalles según el módulo de origen.
        switch (request.origenModulo) {
            case 'INCIDENCIA':
                return this.incidentsService.obtenerDetalleIncidenciaAutorizada(
                    activeUser,
                    companyId,
                    request,
                    true
                );

            case 'MOVIMIENTO_INTERNO':
                return this.internalMovementsService.obtenerDetalleMovimientoAutorizado(
                    activeUser,
                    companyId,
                    request,
                    true
                );

            default:
                throw new BadRequestException(
                    'El módulo de la solicitud no es válido.',
                );
        }
    }

    async aprobarAutomaticamenteSinFlujoAprobacion(
        idTenant: number,
        idEmpresa: number,
        idTipoMovimiento: number,
        idSolicitud: number,
        moduloOrigen: 'INCIDENCIA' | 'MOVIMIENTO_INTERNO' = 'INCIDENCIA',
    ) {
        // 1. Validar que la solicitud exista en el módulo correspondiente.
        let existe = false;

        if (moduloOrigen === 'INCIDENCIA') {
            const solicitud =
                await this.prisma.solicitudesIncidencias.findFirst({
                    where: {
                        idTenant,
                        idEmpresa,
                        idSolicitud,
                        idTipoMovimiento,
                    },
                    select: {
                        idSolicitud: true,
                    },
                });

            existe = !!solicitud;
        } else if (moduloOrigen === 'MOVIMIENTO_INTERNO') {
            const movimiento =
                await this.prisma.movimientosInternos.findFirst({
                    where: {
                        idTenant,
                        idEmpresa,
                        idMovimiento: idSolicitud,
                        idTipoMovimiento,
                    },
                    select: {
                        idMovimiento: true,
                    },
                });

            existe = !!movimiento;
        }

        if (!existe) {
            throw new NotFoundException(
                'La solicitud no existe en el módulo indicado.',
            );
        }

        // 2. Buscar el flujo de aprobación configurado.
        const flujo =
            await this.prisma.configuracionFlujoPaso.findFirst({
                where: {
                    idTenant,
                    idEmpresa,
                    idTipoMovimiento,
                    activo: true,
                },
            });

        // Si existe un flujo, no aprobar automáticamente.
        if (flujo) {
            return 'Flujo de aprobación encontrado';
        }

        this.logger.warn(
            `No existe un flujo de aprobación para el tipo de movimiento ${idTipoMovimiento}; ` +
            `se aprobará automáticamente. Módulo: ${moduloOrigen}.`,
        );

        // 3. Aprobar la solicitud en el módulo correspondiente.
        if (moduloOrigen === 'INCIDENCIA') {
            await this.prisma.$transaction(async (tx) => {
                const actualizacion =
                    await tx.solicitudesIncidencias.updateMany({
                        where: {
                            idTenant,
                            idEmpresa,
                            idSolicitud,
                            idTipoMovimiento,
                        },
                        data: {
                            estatus: 'APROBADA',
                            pasoActual: 1,
                            fechaRespuesta: new Date(),
                        },
                    });

                if (actualizacion.count === 0) {
                    throw new NotFoundException(
                        'No se encontró la solicitud de incidencia para aprobar.',
                    );
                }

                // El paso de aprobación se registra únicamente para incidencias.
                await tx.pasosAprobacionIncidencia.create({
                    data: {
                        idSolicitud,
                        paso: 1,
                        tipoAprobador: 'JERARQUIA',
                        idRolAprobador: null,
                        estatus: 'APROBADA',
                        idUsuarioAprobador: null,
                        idEmpleadoAprobador: null,
                        comentarios:
                            'Aprobada automáticamente por falta de flujo de aprobación.',
                        fechaRespuesta: new Date(),
                    },
                });
            });
        } else {
            // MOVIMIENTO_INTERNO
            await this.prisma.$transaction(async (tx) => {
                const fechaRespuesta = new Date();

                const actualizacion =
                    await tx.movimientosInternos.updateMany({
                        where: {
                            idTenant,
                            idEmpresa,
                            idMovimiento: idSolicitud,
                            idTipoMovimiento,
                        },
                        data: {
                            estatus: 'APROBADA',
                            pasoActual: 1,
                            fechaRespuesta,
                        },
                    });

                if (actualizacion.count === 0) {
                    throw new NotFoundException(
                        'No se encontró el movimiento interno para aprobar.',
                    );
                }

                await tx.pasosAprobacionMovimientoInterno.create({
                    data: {
                        idMovimiento: idSolicitud,
                        paso: 1,
                        tipoAprobador: 'JERARQUIA',
                        idRolAprobador: null,
                        estatus: 'APROBADA',
                        idUsuarioAprobador: null,
                        idEmpleadoAprobador: null,
                        comentarios:
                            'Aprobado automáticamente por falta de flujo de aprobación.',
                        fechaRespuesta,
                    },
                });
            });
        }

        return 'Solicitud aprobada automaticamente por falta de flujo de aprobación.';
    }

}