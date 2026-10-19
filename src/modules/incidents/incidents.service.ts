import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';
import { Prisma } from 'generated/prisma/client';
import { ModuloOrigenEnum } from '../approvals/enums/approval-origin.enum';
import { obtenerIniciales } from '../approvals/utils/approvals.utils';
import { GetIncidentRequestDetailDto } from './dto/get-incident-request-detail.dto';

@Injectable()
export class IncidentsService {
    private readonly logger = new Logger(IncidentsService.name);

    constructor(
        private prisma: PrismaService,
    ) { }

    async findAll(
        activeUser: ActiveUserDto,
        companyId: number,
        query: QueryIncidentsDto,
    ) {
        const page = Math.max(1, query.page ?? 1);
        const limit = Math.min(100, Math.max(1, query.limit ?? 10));
        const search = query.search?.trim();
        const { status } = query;

        const where: Prisma.SolicitudesIncidenciasWhereInput = {
            idTenant: activeUser.idTenant,
            idEmpresa: companyId,
        };

        // Filtro opcional por estatus.
        if (status) {
            where.estatus = status;
        }

        // Búsqueda por datos de la solicitud y del empleado.
        if (search) {
            where.OR = [
                { comentarios: { contains: search } },
                {
                    CatTipoMovimiento: {
                        is: {
                            nombre: { contains: search },
                        },
                    },
                },
                {
                    CatTipoMovimiento: {
                        is: {
                            codigo: { contains: search },
                        },
                    },
                },
                {
                    Empleados_SolicitudesIncidencias_idEmpleadoToEmpleados: {
                        is: {
                            nombre: { contains: search },
                        },
                    },
                },
                {
                    Empleados_SolicitudesIncidencias_idEmpleadoToEmpleados: {
                        is: {
                            primerApellido: { contains: search },
                        },
                    },
                },
                {
                    Empleados_SolicitudesIncidencias_idEmpleadoToEmpleados: {
                        is: {
                            segundoApellido: { contains: search },
                        },
                    },
                },
            ];
        }

        // Total de solicitudes que cumplen los filtros, sin paginar.
        const [total, solicitudes] = await this.prisma.$transaction([
            this.prisma.solicitudesIncidencias.count({
                where,
            }),

            this.prisma.solicitudesIncidencias.findMany({
                where,
                include: {
                    Empleados_SolicitudesIncidencias_idEmpleadoToEmpleados: {
                        select: {
                            idEmpleado: true,
                            nombre: true,
                            primerApellido: true,
                            segundoApellido: true,
                            idJefeInmediato: true,
                            CatPuestos: {
                                select: {
                                    idPuesto: true,
                                    idArea: true,
                                },
                            },
                        },
                    },
                    CatTipoMovimiento: true,
                },
                orderBy: [
                    { fechaRegistro: 'desc' },
                    { idSolicitud: 'desc' },
                ],
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);

        const requests = solicitudes.map((inc) => {
            const empleado =
                inc.Empleados_SolicitudesIncidencias_idEmpleadoToEmpleados;

            const nombreCompleto = [
                empleado?.nombre,
                empleado?.primerApellido,
                empleado?.segundoApellido,
            ]
                .filter(Boolean)
                .join(' ');

            return {
                idOrigen: inc.idSolicitud,
                origenModulo: ModuloOrigenEnum.INCIDENCIA,

                idEmpleado: empleado?.idEmpleado ?? inc.idEmpleado,
                empleadoNombreCompleto: nombreCompleto || 'Sin empleado',
                empleadoIniciales: obtenerIniciales(
                    empleado?.nombre ?? '',
                    empleado?.primerApellido ?? '',
                ),

                comentarioOMotivo: inc.comentarios ?? null,

                idTipoMovimiento: inc.idTipoMovimiento,
                tipoMovimientoNombre:
                    inc.CatTipoMovimiento?.nombre ?? 'Incidencia',
                codigoTipoSolicitud:
                    inc.CatTipoMovimiento?.codigo ?? 'INCIDENCIA',

                // Estado real de la solicitud.
                estatusCodigo: inc.estatus,
                estatusNombre: inc.estatus,

                fechaSolicitud: inc.fechaRegistro,

                // Datos originales útiles para el detalle administrativo.
                solicitud: inc,
            };
        });

        return {
            requests,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
                hasPreviousPage: page > 1,
            },
        };
    }

    async findAllRequested(
        activeUser: ActiveUserDto,
        companyId: number,
        query: QueryIncidentsDto,
    ) {
        const page = Math.max(1, query.page ?? 1);
        const limit = Math.min(100, Math.max(1, query.limit ?? 10));
        const search = query.search?.trim();
        const { status } = query;

        // Obtener el empleado asociado al usuario autenticado.
        const empleadoActual = await this.prisma.empleados.findFirst({
            where: {
                idUsuario: activeUser.uuid,
                idTenant: activeUser.idTenant,
                idEmpresa: companyId,
            },
            select: {
                idEmpleado: true,
            },
        });

        if (!empleadoActual) {
            throw new NotFoundException(
                'No se encontró un empleado asociado al usuario autenticado.',
            );
        }

        const idEmpleadoActual = empleadoActual.idEmpleado;

        const where: Prisma.SolicitudesIncidenciasWhereInput = {
            idTenant: activeUser.idTenant,
            idEmpresa: companyId,

            // El empleado puede ver:
            // 1. Incidencias solicitadas para él mismo.
            // 2. Incidencias que él solicitó para otra persona.
            OR: [
                { idEmpleado: idEmpleadoActual },
                { solicitadoPorIdEmpleado: idEmpleadoActual },
            ],
        };

        // Filtro opcional por estatus.
        if (status) {
            where.estatus = status;
        }

        // Búsqueda.
        if (search) {
            where.AND = [
                {
                    OR: [
                        {
                            comentarios: {
                                contains: search,
                            },
                        },
                        {
                            CatTipoMovimiento: {
                                is: {
                                    nombre: {
                                        contains: search,
                                    },
                                },
                            },
                        },
                        {
                            CatTipoMovimiento: {
                                is: {
                                    codigo: {
                                        contains: search,
                                    },
                                },
                            },
                        },
                        {
                            Empleados_SolicitudesIncidencias_idEmpleadoToEmpleados: {
                                is: {
                                    nombre: {
                                        contains: search,
                                    },
                                },
                            },
                        },
                        {
                            Empleados_SolicitudesIncidencias_idEmpleadoToEmpleados: {
                                is: {
                                    primerApellido: {
                                        contains: search,
                                    },
                                },
                            },
                        },
                        {
                            Empleados_SolicitudesIncidencias_idEmpleadoToEmpleados: {
                                is: {
                                    segundoApellido: {
                                        contains: search,
                                    },
                                },
                            },
                        },
                    ],
                },
            ];
        }

        const [total, solicitudes] = await this.prisma.$transaction([
            this.prisma.solicitudesIncidencias.count({
                where,
            }),

            this.prisma.solicitudesIncidencias.findMany({
                where,

                include: {
                    Empleados_SolicitudesIncidencias_idEmpleadoToEmpleados: {
                        select: {
                            idEmpleado: true,
                            nombre: true,
                            primerApellido: true,
                            segundoApellido: true,
                            idJefeInmediato: true,

                            CatPuestos: {
                                select: {
                                    idPuesto: true,
                                    idArea: true,
                                },
                            },
                        },
                    },

                    CatTipoMovimiento: true,
                },

                orderBy: [
                    {
                        fechaRegistro: 'desc',
                    },
                    {
                        idSolicitud: 'desc',
                    },
                ],

                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);

        const requests = solicitudes.map((inc) => {
            const empleado =
                inc.Empleados_SolicitudesIncidencias_idEmpleadoToEmpleados;

            const nombreCompleto = [
                empleado?.nombre,
                empleado?.primerApellido,
                empleado?.segundoApellido,
            ]
                .filter(Boolean)
                .join(' ');

            return {
                idOrigen: inc.idSolicitud,
                origenModulo: ModuloOrigenEnum.INCIDENCIA,
                idEmpleado: empleado?.idEmpleado ?? inc.idEmpleado,
                empleadoNombreCompleto: nombreCompleto || 'Sin empleado',
                empleadoIniciales: obtenerIniciales(empleado?.nombre ?? '', empleado?.primerApellido ?? ''),
                comentarioOMotivo: inc.comentarios ?? null,
                idTipoMovimiento: inc.idTipoMovimiento,
                tipoMovimientoNombre: inc.CatTipoMovimiento?.nombre ?? 'Incidencia',
                codigoTipoSolicitud: inc.CatTipoMovimiento?.codigo ?? 'INCIDENCIA',
                estatusCodigo: inc.estatus,
                estatusNombre: inc.estatus,
                fechaSolicitud: inc.fechaRegistro,
                solicitud: inc,
            };
        });

        return {
            requests,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
                hasPreviousPage: page > 1,
            },
        };
    }

    async getIncidentRequestDetail(
        activeUser: ActiveUserDto,
        companyId: number,
        query: GetIncidentRequestDetailDto,
    ) {
        if (query.origenModulo !== 'INCIDENCIA') {
            throw new BadRequestException(
                'El módulo de la solicitud no es válido.',
            );
        }

        const incidencia =
            await this.prisma.solicitudesIncidencias.findFirst({
                where: {
                    idSolicitud: query.idOrigen,
                    idTenant: activeUser.idTenant,
                    idEmpresa: companyId,
                },
                include: {
                    Empleados_SolicitudesIncidencias_idEmpleadoToEmpleados: {
                        select: {
                            idEmpleado: true,
                            nombre: true,
                            primerApellido: true,
                            segundoApellido: true,
                        },
                    },
                    CatTipoMovimiento: true,
                },
            });

        if (!incidencia) {
            throw new NotFoundException(
                'La solicitud no existe.',
            );
        }

        const empleado =
            incidencia.Empleados_SolicitudesIncidencias_idEmpleadoToEmpleados;

        const nombreCompleto = [
            empleado?.nombre,
            empleado?.primerApellido,
            empleado?.segundoApellido,
        ]
            .filter(Boolean)
            .join(' ');

        const request = {
            idOrigen: incidencia.idSolicitud,
            origenModulo: ModuloOrigenEnum.INCIDENCIA,

            idEmpleado: empleado?.idEmpleado ?? incidencia.idEmpleado,

            empleadoNombreCompleto: nombreCompleto,

            empleadoIniciales: obtenerIniciales(
                empleado?.nombre ?? '',
                empleado?.primerApellido ?? '',
            ),

            comentarioOMotivo: incidencia.comentarios ?? null,

            idTipoMovimiento: incidencia.idTipoMovimiento,

            tipoMovimientoNombre:
                incidencia.CatTipoMovimiento?.nombre ?? 'Incidencia',

            codigoTipoSolicitud:
                incidencia.CatTipoMovimiento?.codigo ?? 'INCIDENCIA',

            estatusCodigo: incidencia.estatus,

            fechaSolicitud: incidencia.fechaRegistro,

            pasoActual: incidencia.pasoActual ?? 1,
        };

        return this.obtenerDetalleIncidenciaAutorizada(
            activeUser,
            companyId,
            request,
            false,
        );
    }

    async getIncidentRequestedDetail(
        activeUser: ActiveUserDto,
        companyId: number,
        query: GetIncidentRequestDetailDto,
    ) {
        if (query.origenModulo !== 'INCIDENCIA') {
            throw new BadRequestException(
                'El módulo de la solicitud no es válido.',
            );
        }

        // Obtener el empleado asociado al usuario autenticado.
        const empleadoActual = await this.prisma.empleados.findFirst({
            where: {
                idUsuario: activeUser.uuid,
                idTenant: activeUser.idTenant,
                idEmpresa: companyId,
            },
            select: {
                idEmpleado: true,
            },
        });

        if (!empleadoActual) {
            throw new NotFoundException(
                'No se encontró un empleado asociado al usuario autenticado.',
            );
        }

        const idEmpleadoActual = empleadoActual.idEmpleado;

        const incidencia =
            await this.prisma.solicitudesIncidencias.findFirst({
                where: {
                    idSolicitud: query.idOrigen,

                    // Seguridad por tenant y empresa.
                    idTenant: activeUser.idTenant,
                    idEmpresa: companyId,

                    // El usuario solamente puede consultar:
                    // 1. Incidencias solicitadas para él mismo.
                    // 2. Incidencias que él solicitó para otra persona.
                    OR: [
                        {
                            idEmpleado: idEmpleadoActual,
                        },
                        {
                            solicitadoPorIdEmpleado: idEmpleadoActual,
                        },
                    ],
                },

                include: {
                    Empleados_SolicitudesIncidencias_idEmpleadoToEmpleados: {
                        select: {
                            idEmpleado: true,
                            nombre: true,
                            primerApellido: true,
                            segundoApellido: true,
                        },
                    },

                    CatTipoMovimiento: true,
                },
            });

        // Importante:
        // Si existe la solicitud pero no pertenece al usuario actual,
        // tampoco la revelamos. Para él simplemente "no existe".
        if (!incidencia) {
            throw new NotFoundException(
                'La solicitud no existe.',
            );
        }

        const empleado = incidencia.Empleados_SolicitudesIncidencias_idEmpleadoToEmpleados;

        const nombreCompleto = [
            empleado?.nombre,
            empleado?.primerApellido,
            empleado?.segundoApellido,
        ]
            .filter(Boolean)
            .join(' ');

        const request = {
            idOrigen: incidencia.idSolicitud,
            origenModulo: ModuloOrigenEnum.INCIDENCIA,
            idEmpleado: empleado?.idEmpleado ?? incidencia.idEmpleado,
            empleadoNombreCompleto: nombreCompleto || 'Sin empleado',
            empleadoIniciales: obtenerIniciales(empleado?.nombre ?? '', empleado?.primerApellido ?? ''),
            comentarioOMotivo: incidencia.comentarios ?? null,
            idTipoMovimiento: incidencia.idTipoMovimiento,
            tipoMovimientoNombre: incidencia.CatTipoMovimiento?.nombre ?? 'Incidencia',
            codigoTipoSolicitud: incidencia.CatTipoMovimiento?.codigo ?? 'INCIDENCIA',
            estatusCodigo: incidencia.estatus,
            fechaSolicitud: incidencia.fechaRegistro,
            pasoActual: incidencia.pasoActual ?? 1,
        };

        return this.obtenerDetalleIncidenciaAutorizada(
            activeUser,
            companyId,
            request,
            false,
        );
    }

    // ------------------------------------------------------------------
    // Helpers 
    // ------------------------------------------------------------------

    async obtenerDetalleIncidenciaAutorizada(
        activeUser: ActiveUserDto,
        companyId: number,
        request: any,
        soloPendientes: boolean = false,
    ) {
        const codigo = String(request.codigoTipoSolicitud ?? '').trim().toUpperCase();

        // Resolver el tipo de incidencia.
        const esVacaciones = codigo === 'VACACIONES' || request.idTipoMovimiento === 6;
        const esPermiso = ['PERMISO_SIN_GOCE', 'PERMISO_CON_GOCE'].includes(codigo);

        if (!esVacaciones && !esPermiso) {
            throw new BadRequestException(
                'El detalle de este tipo de incidencia todavía no está implementado.',
            );
        }

        // 1. Consultar la solicitud principal.
        const solicitud =
            await this.prisma.solicitudesIncidencias.findFirst({
                where: {
                    idSolicitud: request.idOrigen,
                    idTenant: activeUser.idTenant,
                    idEmpresa: companyId,
                    idTipoMovimiento: request.idTipoMovimiento,
                },
                select: {
                    idSolicitud: true,
                    idTenant: true,
                    idEmpresa: true,
                    idEmpleado: true,
                    solicitadoPorIdEmpleado: true,
                    idTipoMovimiento: true,
                    fechaInicio: true,
                    fechaFin: true,
                    totalDiasLaborales: true,
                    estatus: true,
                    pasoActual: true,
                    idAprobador: true,
                    fechaRespuesta: true,
                    motivoRechazo: true,
                    comentarios: true,
                    fechaRegistro: true,
                },
            });

        if (!solicitud) {
            throw new NotFoundException(
                'La solicitud no existe o no tienes permiso para consultarla.',
            );
        }

        // En el contexto de aprobaciones, no permitir revisar
        // una solicitud que ya dejó de estar pendiente.
        if (soloPendientes && solicitud.estatus !== 'PENDIENTE') {
            throw new BadRequestException(
                'Esta solicitud ya no se encuentra pendiente de aprobación.',
            );
        }

        // 2. Consultar el detalle específico de cada tipo.
        const detalle = await this.obtenerDetalleComplementarioIncidencia(
            solicitud.idSolicitud,
            esVacaciones ? 'VACACIONES' : 'PERMISOS',
        );

        // 3. Construir el flujo o el historial de aprobación.
        const flujo = await this.construirFlujoIncidencia(
            activeUser,
            companyId,
            solicitud,
            request,
        );

        // 4. Respuesta normalizada para el frontend.
        return {
            solicitud: {
                ...solicitud,
                tipo: esVacaciones ? 'VACACIONES' : 'PERMISOS',
                tipoMovimientoNombre: request.tipoMovimientoNombre,
                codigoTipoSolicitud: request.codigoTipoSolicitud,
                empleadoNombreCompleto: request.empleadoNombreCompleto,
                empleadoIniciales: request.empleadoIniciales,
                ...detalle,
            },
            flujo,
        };
    }

    private async obtenerDetalleComplementarioIncidencia(
        idSolicitud: number,
        tipo: 'VACACIONES' | 'PERMISOS',
    ) {
        switch (tipo) {
            case 'VACACIONES': {
                const vacaciones =
                    await this.prisma.solicitudesVacacionesDetalle.findUnique({
                        where: {
                            idSolicitud,
                        },
                        select: {
                            idVacacionDetalle: true,
                            idSolicitud: true,
                            periodoAnio: true,
                            diasPrimaVacacional: true,
                        },
                    });

                if (!vacaciones) {
                    throw new NotFoundException(
                        'No se encontró el detalle complementario de vacaciones.',
                    );
                }

                return {
                    vacaciones,
                };
            }

            case 'PERMISOS': {
                const permiso =
                    await this.prisma.solicitudesPermisosDetalle.findUnique({
                        where: {
                            idSolicitud,
                        },
                        select: {
                            idPermisoDetalle: true,
                            idSolicitud: true,
                            tipoPermiso: true,
                            tipoGoce: true,
                            tipoDuracion: true,
                            horaInicio: true,
                            horaFin: true,
                            regresaATrabajar: true,
                            duracion: true,
                            motivo: true,
                            observaciones: true,
                            solicitadoPorLider: true,
                            archivoNombreOriginal: true,
                            archivoRuta: true,
                            fechaRegistro: true,
                        },
                    });

                if (!permiso) {
                    throw new NotFoundException(
                        'No se encontró el detalle complementario del permiso.',
                    );
                }

                const archivo =
                    await this.prisma.archivosSolicitudes.findFirst({
                        where: {
                            moduloSolicitud: 'INCIDENCIAS',
                            idSolicitud,
                        },
                        orderBy: {
                            fechaRegistro: 'desc',
                        },
                        select: {
                            nombreOriginal: true,
                            rutaRelativa: true,
                        },
                    });

                return {
                    permiso: {
                        ...permiso,
                        archivoNombreOriginal:
                            archivo?.nombreOriginal ??
                            permiso.archivoNombreOriginal ??
                            null,
                        archivoRuta:
                            archivo?.rutaRelativa ??
                            permiso.archivoRuta ??
                            null,
                    },
                };
            }

            default:
                throw new BadRequestException(
                    'El tipo de incidencia no está soportado.',
                );
        }
    }

    private async construirFlujoIncidencia(
        activeUser: ActiveUserDto,
        companyId: number,
        solicitud: {
            idSolicitud: number;
            idTenant: number;
            idEmpresa: number;
            idTipoMovimiento: number;
            estatus: string;
            pasoActual: number | null;
            comentarios: string | null;
            fechaRespuesta: Date | null;
        },
        request: any,
    ) {
        // 1. Consultar los pasos de aprobación configurados.
        const flujoConfigurado =
            await this.prisma.configuracionFlujoPaso.findMany({
                where: {
                    idTenant: activeUser.idTenant,
                    idEmpresa: companyId,
                    idTipoMovimiento: solicitud.idTipoMovimiento,
                    activo: true,
                },
                orderBy: {
                    paso: 'asc',
                },
                select: {
                    idConfiguracionPaso: true,
                    paso: true,
                    codigoTipoSolicitud: true,
                    idModuloFlujo: true,
                    tipoAprobador: true,
                    nivelJerarquia: true,
                    autoAprobarSiSolicitante: true,
                    idRolAprobador: true,
                    modoAsignacionRol: true,
                    idUsuarioFijoRol: true,
                },
            });

        // 2. Consultar los pasos ejecutados, incluyendo aprobaciones
        // automáticas que hayan quedado registradas.
        const pasosEjecutados =
            await this.prisma.pasosAprobacionIncidencia.findMany({
                where: {
                    idSolicitud: solicitud.idSolicitud,
                },
                orderBy: {
                    paso: 'asc',
                },
                select: {
                    idPasoAprobacion: true,
                    idSolicitud: true,
                    paso: true,
                    tipoAprobador: true,
                    idRolAprobador: true,
                    estatus: true,
                    idUsuarioAprobador: true,
                    idEmpleadoAprobador: true,
                    comentarios: true,
                    fechaRespuesta: true,
                },
            });

        // 3. Buscar los usuarios que respondieron.
        const usuariosIds = [
            ...new Set(
                pasosEjecutados
                    .map((paso) => paso.idUsuarioAprobador)
                    .filter((id): id is string => Boolean(id)),
            ),
        ];

        const usuarios = usuariosIds.length
            ? await this.prisma.auth_user.findMany({
                where: {
                    idTenant: activeUser.idTenant,
                    uuid: {
                        in: usuariosIds,
                    },
                },
                select: {
                    uuid: true,
                    first_name: true,
                    last_name: true,
                    username: true,
                },
            })
            : [];

        const usuariosMap = new Map(
            usuarios.map((usuario) => [
                usuario.uuid,
                `${usuario.first_name ?? ''} ${usuario.last_name ?? ''}`.trim() ||
                usuario.username,
            ]),
        );

        // 4. Resolver los roles utilizados tanto en la configuración
        // como en los pasos que efectivamente se ejecutaron.
        const rolesIds = [
            ...new Set(
                [
                    ...flujoConfigurado.map((paso) => paso.idRolAprobador),
                    ...pasosEjecutados.map((paso) => paso.idRolAprobador),
                ].filter((id): id is number => id !== null),
            ),
        ];

        const roles = rolesIds.length
            ? await this.prisma.catRoles.findMany({
                where: {
                    idTenant: activeUser.idTenant,
                    idRol: {
                        in: rolesIds,
                    },
                },
                select: {
                    idRol: true,
                    descripcion: true,
                },
            })
            : [];

        const rolesMap = new Map(
            roles.map((rol) => [rol.idRol, rol.descripcion]),
        );

        // 5. Asociar los pasos ejecutados con los pasos configurados.
        const pasosMap = new Map(
            pasosEjecutados.map((paso) => [paso.paso, paso]),
        );

        let pasos;

        if (flujoConfigurado.length > 0) {
            // Existe flujo: mostrar los pasos configurados y su estado.
            pasos = flujoConfigurado.map((config) => {
                const ejecutado = pasosMap.get(config.paso);

                return {
                    paso: config.paso,
                    estatus: ejecutado?.estatus ?? 'PENDIENTE',
                    tipoAprobador: config.tipoAprobador,
                    nivelJerarquia: config.nivelJerarquia,
                    idRolAprobador: config.idRolAprobador,
                    nombreRolAprobador: config.idRolAprobador
                        ? rolesMap.get(config.idRolAprobador) ?? null
                        : null,
                    modoAsignacionRol: config.modoAsignacionRol,
                    idUsuarioFijoRol: config.idUsuarioFijoRol,

                    idPasoAprobacion: ejecutado?.idPasoAprobacion ?? null,
                    idUsuarioAprobador: ejecutado?.idUsuarioAprobador ?? null,
                    idEmpleadoAprobador: ejecutado?.idEmpleadoAprobador ?? null,

                    nombreUsuarioAprobador: ejecutado?.idUsuarioAprobador
                        ? usuariosMap.get(ejecutado.idUsuarioAprobador) ?? null
                        : null,

                    comentarios: ejecutado?.comentarios ?? null,
                    fechaRespuesta: ejecutado?.fechaRespuesta ?? null,
                };
            });
        } else if (pasosEjecutados.length > 0) {
            // No hay flujo configurado: mostrar el historial real.
            pasos = pasosEjecutados.map((ejecutado) => ({
                paso: ejecutado.paso,
                estatus: ejecutado.estatus,
                tipoAprobador: ejecutado.tipoAprobador,
                nivelJerarquia: null,
                idRolAprobador: ejecutado.idRolAprobador,
                nombreRolAprobador: ejecutado.idRolAprobador
                    ? rolesMap.get(ejecutado.idRolAprobador) ?? null
                    : null,
                modoAsignacionRol: null,
                idUsuarioFijoRol: null,

                idPasoAprobacion: ejecutado.idPasoAprobacion,
                idUsuarioAprobador: ejecutado.idUsuarioAprobador,
                idEmpleadoAprobador: ejecutado.idEmpleadoAprobador,

                nombreUsuarioAprobador: ejecutado.idUsuarioAprobador
                    ? usuariosMap.get(ejecutado.idUsuarioAprobador) ?? null
                    : null,

                comentarios: ejecutado.comentarios ??
                    'Solicitud aprobada automáticamente por falta de flujo de aprobación.',
                fechaRespuesta: ejecutado.fechaRespuesta,
            }));
        } else {
            // Respaldo por si no existe configuración ni historial.
            // No se guarda nada en la base de datos desde este método.
            pasos = [
                {
                    paso: solicitud.pasoActual ?? request.pasoActual ?? 1,
                    estatus: solicitud.estatus,
                    tipoAprobador: 'AUTOMATICO',
                    nivelJerarquia: null,
                    idRolAprobador: null,
                    nombreRolAprobador: null,
                    modoAsignacionRol: null,
                    idUsuarioFijoRol: null,

                    idPasoAprobacion: null,
                    idUsuarioAprobador: null,
                    idEmpleadoAprobador: null,
                    nombreUsuarioAprobador: null,

                    comentarios:
                        solicitud.comentarios ??
                        'Solicitud aprobada automáticamente por falta de flujo de aprobación.',
                    fechaRespuesta: solicitud.fechaRespuesta,
                },
            ];
        }

        const pasoActual = pasos.find(
            (paso) =>
                paso.estatus === 'PENDIENTE' &&
                paso.paso === (solicitud.pasoActual ?? request.pasoActual),
        );

        return {
            pasoActual:
                pasoActual?.paso ??
                solicitud.pasoActual ??
                request.pasoActual ??
                null,

            totalPasos: pasos.length,
            pasos,
            tieneFlujoConfigurado: flujoConfigurado.length > 0,
            aprobacionAutomatica: flujoConfigurado.length === 0,
        };
    }
}
