import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';
import { Prisma } from 'generated/prisma/client';
import { PersonnelConfigService } from '../config/personnel-config/personnel-config.service';
import { ModuloOrigenEnum } from '../approvals/enums/approval-origin.enum';
import { obtenerIniciales } from '../approvals/utils/approvals.utils';
import { GetIncidentRequestDetailDto } from './dto/get-incident-request-detail.dto';
import { ApprovalsService } from '../approvals/approvals.service';

@Injectable()
export class IncidentsService {
    private readonly logger = new Logger(IncidentsService.name);

    constructor(
        private prisma: PrismaService,
        private readonly approvalService: ApprovalsService,
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

        return this.approvalService.obtenerDetalleIncidenciaAutorizada(
            activeUser,
            companyId,
            request,
            false,
        );
    }
}
