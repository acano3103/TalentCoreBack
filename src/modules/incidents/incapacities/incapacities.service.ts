import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CreateIncapacityDto } from './dto/create-incapacity.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { MediaPathService } from 'src/common/services/media-path.service';
import { PermissionsService } from '../permissions/permissions.service';
import { ApprovalsService } from 'src/modules/approvals/approvals.service';

@Injectable()
export class IncapacitiesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly mediaPathService: MediaPathService,
        private readonly permissionsService: PermissionsService,
        private approvalsService: ApprovalsService,
    ) { }

    async createIncapacity(
        activeUser: ActiveUserDto,
        companyId: number,
        dto: CreateIncapacityDto,
        archivo: Express.Multer.File | undefined,
    ) {
        // 1. Validaciones iniciales.
        if (!Number.isInteger(companyId) || companyId < 1) {
            throw new BadRequestException('La empresa no es válida.');
        }

        if (archivo && archivo.size > 10 * 1024 * 1024) {
            throw new BadRequestException(
                'El archivo no debe exceder los 10 MB.',
            );
        }

        if (
            archivo &&
            ![
                'application/pdf',
                'image/jpeg',
                'image/png',
                'image/webp',
            ].includes(archivo.mimetype)
        ) {
            throw new BadRequestException(
                'El comprobante debe ser un PDF o una imagen JPG, PNG o WEBP.',
            );
        }

        // 2. Validar al usuario solicitante.
        const requesterEmployee =
            await this.prisma.empleados.findFirst({
                where: {
                    idUsuario: activeUser.uuid,
                    idEmpresa: companyId,
                    idTenant: activeUser.idTenant,
                    activo: true,
                },
                select: {
                    idEmpleado: true,
                },
            });

        if (!requesterEmployee) {
            throw new NotFoundException(
                'No se encontró un empleado activo para el usuario solicitante.',
            );
        }

        // 3. Obtener balance y configuración del empleado.
        const balanceData =
            await this.permissionsService.getEmployeeBalance(
                activeUser,
                companyId,
                dto.idEmpleado,
            );

        const { constraints } = balanceData;

        // 4. Validar el comprobante según la configuración.
        const comprobanteObligatorio =
            constraints?.comprobanteObligatorio ?? true;

        if (comprobanteObligatorio && !archivo) {
            throw new BadRequestException(
                'Debes adjuntar el comprobante de la incapacidad.',
            );
        }

        // 5. Validar las fechas recibidas.
        const parseDateOnly = (value: string): Date => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                throw new BadRequestException(
                    `La fecha "${value}" debe tener formato YYYY-MM-DD.`,
                );
            }

            const date = new Date(
                `${value}T00:00:00.000Z`,
            );

            if (
                Number.isNaN(date.getTime()) ||
                date.toISOString().slice(0, 10) !== value
            ) {
                throw new BadRequestException(
                    `La fecha "${value}" no es válida.`,
                );
            }

            return date;
        };

        const startDate = parseDateOnly(dto.fechaInicio);
        const endDate = parseDateOnly(dto.fechaFin);

        if (endDate < startDate) {
            throw new BadRequestException(
                'La fecha final no puede ser anterior a la fecha inicial.',
            );
        }

        // 6. RESPETAR EL TOTAL DE DÍAS CALCULADO EN EL FRONTEND.
        //
        // El frontend es quien determina si se cuentan:
        // - únicamente los días laborales, o
        // - todos los días corridos incluyendo días de descanso.
        //
        // Por lo tanto, el backend NO vuelve a calcular los días
        // utilizando workingDays.
        const totalDiasLaborales = Number(dto.totalDiasLaborales);

        if (
            !Number.isInteger(totalDiasLaborales) ||
            totalDiasLaborales < 1
        ) {
            throw new BadRequestException(
                'El total de días de la incapacidad debe ser un número entero mayor a cero.',
            );
        }

        // 7. Validar que el total recibido sea razonable respecto al rango.
        //
        // Como el frontend puede enviar:
        // - días laborales, o
        // - días corridos,
        //
        // el máximo permitido siempre será la cantidad de días
        // calendario existentes entre fechaInicio y fechaFin.
        const diferenciaMilisegundos =
            endDate.getTime() - startDate.getTime();

        const diasCalendario =
            Math.floor(
                diferenciaMilisegundos /
                (1000 * 60 * 60 * 24),
            ) + 1;

        if (totalDiasLaborales > diasCalendario) {
            throw new BadRequestException(
                'El total de días de la incapacidad no puede ser mayor al número de días del periodo seleccionado.',
            );
        }

        // 8. Validar el tipo de incapacidad.
        const tipoIncapacidad = String(
            dto.tipoIncapacidad ?? '',
        )
            .trim()
            .toUpperCase()
            .replace(/[\s-]+/g, '_');

        const tiposIncapacidadPermitidos = [
            'ENFERMEDAD_GENERAL',
            'RIESGO_TRABAJO',
            'ACCIDENTE_TRABAJO',
            'MATERNIDAD',
            'OTRO',
        ];

        if (
            !tiposIncapacidadPermitidos.includes(
                tipoIncapacidad,
            )
        ) {
            throw new BadRequestException(
                `El tipo de incapacidad "${dto.tipoIncapacidad}" no es válido.`,
            );
        }

        // 9. Buscar el tipo de movimiento.
        const tipoMovimiento =
            await this.prisma.catTipoMovimiento.findFirst({
                where: {
                    codigo: 'INCAPACIDAD_MEDICA',
                    idModuloFlujo: 1,
                    activo: true,
                },
                select: {
                    idTipoMovimiento: true,
                    codigo: true,
                },
            });

        if (!tipoMovimiento) {
            throw new NotFoundException(
                'No se encontró el tipo de movimiento activo INCAPACIDAD en el catálogo.',
            );
        }

        // 10. Crear la solicitud general y su detalle en una transacción.
        const solicitud = await this.prisma.$transaction(
            async (tx) => {
                const nuevaSolicitud =
                    await tx.solicitudesIncidencias.create({
                        data: {
                            idTenant: activeUser.idTenant,
                            idEmpresa: companyId,
                            idEmpleado: dto.idEmpleado,
                            idTipoMovimiento:
                                tipoMovimiento.idTipoMovimiento,
                            solicitadoPorIdEmpleado:
                                requesterEmployee.idEmpleado,
                            fechaInicio: startDate,
                            fechaFin: endDate,

                            // IMPORTANTE:
                            // Se guarda exactamente el valor
                            // calculado por el frontend.
                            totalDiasLaborales,

                            estatus: 'PENDIENTE',
                            comentarios:
                                dto.observaciones?.trim() ||
                                null,
                        },
                    });

                await tx.solicitudesIncapacidadesDetalle.create({
                    data: {
                        idSolicitud:
                            nuevaSolicitud.idSolicitud,
                        tipoIncapacidad,
                        numeroCertificado:
                            dto.numeroCertificado?.trim() ||
                            null,
                        institucionMedica:
                            dto.institucionMedica?.trim() ||
                            null,
                        observaciones:
                            dto.observaciones?.trim() || null,
                        solicitadoPorLider:
                            dto.solicitadoPorLider,
                    },
                });

                return nuevaSolicitud;
            },
        );

        // 11. Guardar el archivo físico y sus metadatos.
        const rutasArchivosGuardados: string[] = [];

        try {
            if (archivo) {
                if (
                    !archivo.buffer ||
                    archivo.buffer.length === 0
                ) {
                    throw new BadRequestException(
                        'El archivo recibido no contiene datos.',
                    );
                }

                const archivoGuardado =
                    await this.mediaPathService.saveFile(
                        archivo,
                        {
                            idTenant: activeUser.idTenant,
                            subfolder:
                                `solicitudes/incidencias/incapacidades/${solicitud.idSolicitud}`,
                        },
                    );

                rutasArchivosGuardados.push(
                    archivoGuardado.rutaRelativa,
                );

                await this.prisma.archivosSolicitudes.create({
                    data: {
                        idTenant: activeUser.idTenant,
                        idEmpresa: companyId,
                        idEmpleado: dto.idEmpleado,
                        moduloSolicitud: 'INCIDENCIAS',
                        idSolicitud: solicitud.idSolicitud,
                        nombreOriginal:
                            archivoGuardado.nombreOriginal,
                        nombreAlmacenado:
                            archivoGuardado.nombreAlmacenado,
                        rutaRelativa:
                            archivoGuardado.rutaRelativa,
                        mimeType:
                            archivoGuardado.mimeType,
                        tamanoBytes: BigInt(
                            archivoGuardado.tamanoBytes,
                        ),
                        usuarioRegistro: activeUser.uuid,
                    },
                });
            }
        } catch (error) {
            // Si falla el guardado, intentamos eliminar los archivos físicos.
            await Promise.all(
                rutasArchivosGuardados.map(
                    async (ruta) => {
                        try {
                            await this.mediaPathService.deleteFile(
                                ruta,
                            );
                        } catch {
                            // Conservamos el error original.
                        }
                    },
                ),
            );

            // Eliminar los registros de la solicitud incompleta.
            await this.prisma.$transaction(async (tx) => {
                await tx.archivosSolicitudes.deleteMany({
                    where: {
                        idTenant: activeUser.idTenant,
                        idEmpresa: companyId,
                        moduloSolicitud: 'INCIDENCIAS',
                        idSolicitud: solicitud.idSolicitud,
                    },
                });

                await tx.solicitudesIncapacidadesDetalle.deleteMany(
                    {
                        where: {
                            idSolicitud:
                                solicitud.idSolicitud,
                        },
                    },
                );

                await tx.solicitudesIncidencias.delete({
                    where: {
                        idSolicitud:
                            solicitud.idSolicitud,
                    },
                });
            });

            if (
                error instanceof BadRequestException ||
                error instanceof NotFoundException
            ) {
                throw error;
            }

            throw new InternalServerErrorException(
                'No fue posible guardar el comprobante de la incapacidad.',
            );
        }

        // 12. Consultar los archivos asociados a la solicitud.
        const archivos =
            await this.prisma.archivosSolicitudes.findMany({
                where: {
                    idTenant: activeUser.idTenant,
                    idEmpresa: companyId,
                    idEmpleado: dto.idEmpleado,
                    moduloSolicitud: 'INCIDENCIAS',
                    idSolicitud: solicitud.idSolicitud,
                },
                select: {
                    idArchivoSolicitud: true,
                    nombreOriginal: true,
                    rutaRelativa: true,
                    mimeType: true,
                    tamanoBytes: true,
                    fechaRegistro: true,
                },
            });

        // Aprobar la solicitud automaticamente si no tiene flujo de aprobación.
        await this.approvalsService.aprobarAutomaticamenteSinFlujoAprobacion(
            activeUser.idTenant,
            companyId,
            tipoMovimiento.idTipoMovimiento,
            solicitud.idSolicitud,
        );

        // 13. Respuesta.
        return {
            message:
                'Solicitud de incapacidad registrada con éxito.',

            data: {
                ...solicitud,

                // Se devuelve exactamente el valor recibido
                // desde el frontend.
                totalDiasLaborales,

                tipoIncapacidad,

                numeroCertificado:
                    dto.numeroCertificado?.trim() || null,

                institucionMedica:
                    dto.institucionMedica?.trim() || null,

                solicitadoPorLider:
                    dto.solicitadoPorLider,

                archivos: archivos.map((item) => ({
                    ...item,
                    tamanoBytes:
                        item.tamanoBytes.toString(),
                })),
            },
        };
    }
}