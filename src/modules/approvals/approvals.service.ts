import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ActionApprovalDto } from './dto/approve-reject-action.dto';
import { ModuloOrigenEnum, AccionAprobacionEnum } from './enums/approval-origin.enum';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { PersonnelConfigService } from '../config/personnel-config/personnel-config.service';
import { GetApprovalRequestDetailDto } from './dto/get-approval-request-detail.dto';
import { obtenerIniciales } from './utils/approvals.utils';
import { IncidentsService } from '../incidents/incidents.service';

@Injectable()
export class ApprovalsService {
    private readonly logger = new Logger(ApprovalsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly personnelConfig: PersonnelConfigService,
        private readonly incidentsService: IncidentsService,
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
                    idEmpresa: companyId,
                    idEstatusMovimiento: { in: [1, 2, 3, 4, 5] },
                },
                include: {
                    Empleados: {
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
                    PasosAprobacionMovimiento: {
                        where: { idEstatus: 1 },
                        orderBy: { paso: 'asc' },
                        take: 1,
                    },
                },
                orderBy: { fechaRegistro: 'desc' },
            });

            const pendientesMovimientos: any[] = [];

            for (const mov of movimientos) {
                const tipoMovimiento = await this.prisma.catTipoMovimiento.findFirst({ where: { nombre: mov.tipoMovimiento } });
                if (!tipoMovimiento) continue;
                const idTipoMov = tipoMovimiento.idTipoMovimiento;
                const flujo = await obtenerFlujoConfig(idTipoMov);

                // Si no tiene flujo configurado o no tiene pasos, se ignora.
                if (!flujo?.pasos?.length) continue;

                const pasoActivo = mov.PasosAprobacionMovimiento?.[0];
                const pasoNum = pasoActivo?.paso ?? 1;
                const pasoConfig = flujo.pasos.find((p: any) => p.paso === pasoNum);
                if (!pasoConfig) continue;

                const solicitante = mov.Empleados;
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

                    pendientesMovimientos.push({
                        idOrigen: mov.idMovimiento,
                        origenModulo: ModuloOrigenEnum.MOVIMIENTO_INTERNO,
                        idEmpleado: solicitante.idEmpleado,
                        empleadoNombreCompleto: nombreCompleto,
                        empleadoIniciales: obtenerIniciales(
                            solicitante.nombre || '',
                            solicitante.primerApellido || '',
                        ),
                        comentarioOMotivo: mov.motivo || null,
                        idTipoMovimiento: idTipoMov,
                        tipoMovimientoNombre: (mov as any).tipoMovimiento || 'Movimiento Interno',
                        codigoTipoSolicitud: 'MOVIMIENTO_INTERNO',
                        estatusCodigo: `PENDIENTE_PASO_${pasoNum}`,
                        estatusNombre: `PENDIENTE (${pasoConfig.nombreRol || pasoConfig.tipoAprobador})`,
                        pasoActual: pasoNum,
                        totalPasos: flujo.totalPasos || flujo.pasos.length,
                        fechaSolicitud: mov.fechaRegistro,
                        requiereMiAprobacion: true,
                    });
                }
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
            // Implementas exactamente la misma lógica de avance sobre MovimientosInternos y PasosAprobacionMovimiento
            return { message: 'Movimiento interno procesado correctamente' };
        }

        throw new BadRequestException('Módulo de origen no reconocido');
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

            // case 'MOVIMIENTO_INTERNO':
            //     return this.obtenerDetalleMovimientoAutorizado(
            //         activeUser,
            //         companyId,
            //         request,
            //     );

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
    ) {
        const existe = await this.prisma.solicitudesIncidencias.findFirst({
            where: {
                idTenant,
                idEmpresa,
                idSolicitud,
                idTipoMovimiento,
            },
        });

        if (!existe) {
            throw new NotFoundException(
                'La solicitud no existe.',
            );
        }

        // Buscar el flujo de aprobación.
        const flujo = await this.prisma.configuracionFlujoPaso.findFirst({
            where: {
                idTenant,
                idEmpresa,
                idTipoMovimiento,
                activo: true,
            },
        });

        if (!flujo) {
            this.logger.warn('No existe un flujo de aprobación para el tipo de movimiento ' + idTipoMovimiento + ' , se aprueba en automático ');

            await this.prisma.solicitudesIncidencias.update({
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

            // Crear un paso de aprobación
            await this.prisma.pasosAprobacionIncidencia.create({
                data: {
                    idSolicitud,
                    paso: 1,
                    tipoAprobador: 'JERARQUIA',
                    idRolAprobador: null,
                    estatus: 'APROBADA',
                    idUsuarioAprobador: null,
                    idEmpleadoAprobador: null,
                    comentarios: 'Aprobada automáticamente por falta de flujo de aprobación.',
                    fechaRespuesta: new Date(),
                },
            });
            return 'Solicitud aprobada automaticamente por falta de flujo de aprobación.';
        } else {
            return 'Flujo de aprobación encontrado';
        }
    }

}