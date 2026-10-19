import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PersonnelConfigService } from 'src/modules/config/personnel-config/personnel-config.service';
import { EmployeesService } from 'src/modules/employees/employees.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { DIAS_SEMANA_MAP } from '../constants/incidents.constants';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { SolicitudesIncidencias_estatus } from 'generated/prisma/enums';
import { MediaPathService } from 'src/common/services/media-path.service';
import { IncidentsService } from '../incidents.service';
import { ApprovalsService } from 'src/modules/approvals/approvals.service';

@Injectable()
export class PermissionsService {
    private readonly logger = new Logger(PermissionsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly employeeService: EmployeesService,
        private readonly personnelConfig: PersonnelConfigService,
        private mediaPathService: MediaPathService,
        private approvalsService: ApprovalsService,
    ) { }

    // Obtiene el balance de permisos de un empleado
    async getEmployeeBalance(
        activeUser: ActiveUserDto,
        companyId: number,
        employeeId: number,
    ) {
        const employee = await this.employeeService.findOne(companyId, employeeId);

        if (!employee) {
            throw new NotFoundException(
                'El empleado solicitado no existe o no pertenece a la empresa.',
            );
        }

        const config = await this.personnelConfig.getConfiguracionPersonal(activeUser.idTenant, companyId);

        const permissionConfig = config?.permisosEIncapacidades ?? {};
        const horasLimiteSubirComprobante = Number(permissionConfig.horasLimiteSubirComprobante ?? 48);
        const comprobanteObligatorio = !!permissionConfig.comprobanteObligatorio;
        const diasAnticipacionPermiso = Number(permissionConfig.diasAnticipacionPermiso ?? 0);
        const workingDaysSet = new Set<number>();

        const days = Array.isArray(employee.horarios) ? employee.horarios.map((horario) => {
            const diaSemana = horario?.DiaSemana?.trim()?.toLowerCase();

            if (!diaSemana || DIAS_SEMANA_MAP[diaSemana] === undefined) return null;

            const day = DIAS_SEMANA_MAP[diaSemana];
            workingDaysSet.add(day);

            const entrada = horario?.HoraEntrada;
            const salida = horario?.HoraSalida;
            const formatTime = (value: Date | null | undefined) => {
                if (!value) return null;
                return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
            };

            return {
                day,
                name: horario.DiaSemana,
                startTime: formatTime(new Date(entrada)),
                endTime: formatTime(new Date(salida)),
            };
        }).filter(Boolean) : [];

        const workingDays = workingDaysSet.size > 0 ? Array.from(workingDaysSet).sort((a, b) => a - b) : [1, 2, 3, 4, 5];
        const restDays = [0, 1, 2, 3, 4, 5, 6].filter((day) => !workingDays.includes(day));
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const earliestAllowedDate = new Date(todayStart);
        earliestAllowedDate.setDate(earliestAllowedDate.getDate() + diasAnticipacionPermiso);

        return {
            employee: {
                idEmpleado: employee.idEmpleado,
                numeroEmpleado: employee.numeroEmpleado,
                nombreCompleto: [
                    employee.nombre,
                    employee.primerApellido,
                    employee.segundoApellido,
                ]
                    .filter(Boolean)
                    .join(' '),
                puesto: employee.nombrePuesto,
                fechaIngreso: employee.fechaIngreso,
            },
            config: {
                horasLimiteSubirComprobante,
                comprobanteObligatorio,
                diasAnticipacionPermiso,
            },
            schedule: {
                workingDays,
                restDays,
                days,
            },
            constraints: {
                fechaMinimaPermitida:
                    earliestAllowedDate
                        .toISOString()
                        .split('T')[0],
                diasAnticipacionMinima:
                    diasAnticipacionPermiso,
                horasLimiteSubirComprobante,
                comprobanteObligatorio,
            },
        };
    }


    private parseDateOnly(value: string): Date {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw new BadRequestException('Formato de fecha inválido.');
        }

        const [year, month, day] = value.split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));

        if (
            date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month - 1 ||
            date.getUTCDate() !== day
        ) {
            throw new BadRequestException('La fecha proporcionada no es válida.');
        }

        return date;
    }

    private timeToMinutes(value: string): number {
        if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
            throw new BadRequestException('Formato de hora inválido. Utiliza HH:mm.');
        }

        const [hours, minutes] = value.split(':').map(Number);
        return hours * 60 + minutes;
    }

    private countWorkingDays(
        startDate: Date,
        endDate: Date,
        workingDays: number[],
    ): number {
        let total = 0;

        for (
            const current = new Date(startDate);
            current <= endDate;
            current.setUTCDate(current.getUTCDate() + 1)
        ) {
            if (workingDays.includes(current.getUTCDay())) {
                total++;
            }
        }

        return total;
    }

    async createPermission(
        activeUser: ActiveUserDto,
        companyId: number,
        dto: CreatePermissionDto,
        archivo: Express.Multer.File | undefined,
    ) {
        if (!Number.isInteger(companyId) || companyId < 1) {
            throw new BadRequestException('La empresa no es válida.');
        }

        if (archivo && archivo.size > 10 * 1024 * 1024) {
            throw new BadRequestException(
                'El archivo no debe exceder los 10MB.',
            );
        }

        // 1. Validar al usuario solicitante.
        const requesterEmployee = await this.prisma.empleados.findFirst({
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

        // 2. Validar al empleado destinatario.
        const balanceData = await this.getEmployeeBalance(
            activeUser,
            companyId,
            dto.idEmpleado,
        );

        const { constraints, schedule } = balanceData;

        // 3. Determinar el tipo de movimiento correcto.
        // Los códigos existentes son PERMISO_CON_GOCE y PERMISO_SIN_GOCE.
        const tipoGoceNormalizado = String(dto.tipoGoce ?? '')
            .trim()
            .toUpperCase()
            .replace(/[\s-]+/g, '_');

        let codigoTipoMovimiento: string;

        switch (tipoGoceNormalizado) {
            case 'CON_GOCE':
            case 'CON_GOCE_SUELDO':
            case 'CON_GOCE_DE_SUELDO':
                codigoTipoMovimiento = 'PERMISO_CON_GOCE';
                break;

            case 'SIN_GOCE':
            case 'SIN_GOCE_SUELDO':
            case 'SIN_GOCE_DE_SUELDO':
                codigoTipoMovimiento = 'PERMISO_SIN_GOCE';
                break;

            default:
                throw new BadRequestException(
                    `El tipo de goce "${dto.tipoGoce}" no es válido. ` +
                    'Se esperaba un permiso con goce o sin goce de sueldo.',
                );
        }

        const tipoMovimiento =
            await this.prisma.catTipoMovimiento.findFirst({
                where: {
                    codigo: codigoTipoMovimiento,
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
                `No se encontró el tipo de movimiento activo ${codigoTipoMovimiento}.`,
            );
        }

        // 4. Funciones auxiliares para validar fechas y horas.
        const parseDateOnly = (value: string): Date => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                throw new BadRequestException(
                    `La fecha "${value}" debe tener formato YYYY-MM-DD.`,
                );
            }

            const date = new Date(`${value}T00:00:00.000Z`);

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

        const timeToMinutes = (value: string): number => {
            const match =
                /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);

            if (!match) {
                throw new BadRequestException(
                    `La hora "${value}" debe tener formato HH:mm.`,
                );
            }

            return Number(match[1]) * 60 + Number(match[2]);
        };

        // 5. Validar rango de fechas.

        const startDate = parseDateOnly(dto.fechaInicio);
        const endDate = parseDateOnly(dto.fechaFin || dto.fechaInicio);

        if (dto.tipoDuracion === 'HORAS') {
            if (dto.fechaFin && dto.fechaFin !== dto.fechaInicio) {
                throw new BadRequestException(
                    'Los permisos por horas deben corresponder a un solo día.',
                );
            }
        } else if (endDate < startDate) {
            throw new BadRequestException(
                'La fecha final no puede ser anterior a la fecha inicial.',
            );
        }


        if (
            constraints.fechaMinimaPermitida &&
            dto.fechaInicio < constraints.fechaMinimaPermitida
        ) {
            throw new BadRequestException(
                `La fecha de inicio debe ser igual o posterior a ${constraints.fechaMinimaPermitida}.`,
            );
        }

        // 6. Calcular duración del permiso.
        let duracionCalculada = 0;
        let totalDiasLaborales = 0;
        let horaInicio: string | null = null;
        let horaFin: string | null = null;

        if (dto.tipoDuracion === 'DIAS') {
            const workingDays = new Set<number>(
                (schedule.workingDays ?? []).map(Number),
            );

            for (
                let current = new Date(startDate);
                current <= endDate;
                current.setUTCDate(current.getUTCDate() + 1)
            ) {
                if (workingDays.has(current.getUTCDay())) {
                    totalDiasLaborales++;
                }
            }

            if (totalDiasLaborales < 1) {
                throw new BadRequestException(
                    'El rango seleccionado no contiene días laborables.',
                );
            }

            duracionCalculada = totalDiasLaborales;
        } else if (dto.tipoDuracion === 'HORAS') {
            if (!dto.horaInicio) {
                throw new BadRequestException(
                    'Debes indicar la hora de inicio del permiso.',
                );
            }

            if (dto.fechaFin && dto.fechaFin !== dto.fechaInicio) {
                throw new BadRequestException(
                    'Los permisos por horas deben corresponder a un solo día.',
                );
            }

            const dayOfWeek = startDate.getUTCDay();

            const daySchedule = (schedule.days ?? []).find(
                (day) => day !== null && Number(day.day) === dayOfWeek,
            );

            if (!daySchedule?.startTime || !daySchedule?.endTime) {
                throw new BadRequestException(
                    'El empleado no tiene un horario laboral configurado para ese día.',
                );
            }

            const startMinutes = timeToMinutes(dto.horaInicio);
            const scheduleStart = timeToMinutes(daySchedule.startTime);
            const scheduleEnd = timeToMinutes(daySchedule.endTime);

            if (
                startMinutes < scheduleStart ||
                startMinutes >= scheduleEnd
            ) {
                throw new BadRequestException(
                    'La hora de inicio debe estar dentro del horario laboral.',
                );
            }

            if (dto.regresaATrabajar) {
                if (!dto.horaFin) {
                    throw new BadRequestException(
                        'Debes indicar la hora de regreso al trabajo.',
                    );
                }

                const endMinutes = timeToMinutes(dto.horaFin);

                if (
                    endMinutes <= startMinutes ||
                    endMinutes > scheduleEnd
                ) {
                    throw new BadRequestException(
                        'La hora de regreso debe ser posterior a la salida y no exceder el fin del horario laboral.',
                    );
                }

                horaFin = dto.horaFin;
                duracionCalculada = (endMinutes - startMinutes) / 60;
            } else {
                // El permiso termina al finalizar el horario laboral.
                duracionCalculada = (scheduleEnd - startMinutes) / 60;
            }

            horaInicio = dto.horaInicio;
        } else {
            throw new BadRequestException(
                'El tipo de duración del permiso no es válido.',
            );
        }

        if (duracionCalculada <= 0) {
            throw new BadRequestException(
                'La duración calculada del permiso debe ser mayor a cero.',
            );
        }

        // 7. Crear solicitud general y detalle en una transacción.
        const solicitud = await this.prisma.$transaction(async (tx) => {
            const nuevaSolicitud = await tx.solicitudesIncidencias.create({
                data: {
                    idTenant: activeUser.idTenant,
                    idEmpresa: companyId,
                    idEmpleado: dto.idEmpleado,
                    idTipoMovimiento: tipoMovimiento.idTipoMovimiento,
                    solicitadoPorIdEmpleado: requesterEmployee.idEmpleado,
                    fechaInicio: startDate,
                    fechaFin: endDate,
                    totalDiasLaborales: totalDiasLaborales,
                    estatus: SolicitudesIncidencias_estatus.PENDIENTE,
                    comentarios: dto.observaciones || null,
                },
            });

            await tx.solicitudesPermisosDetalle.create({
                data: {
                    idSolicitud: nuevaSolicitud.idSolicitud,
                    tipoPermiso: dto.tipoPermiso,
                    tipoGoce: dto.tipoGoce,
                    tipoDuracion: dto.tipoDuracion,
                    horaInicio: horaInicio
                        ? new Date(`1970-01-01T${horaInicio}:00.000Z`)
                        : null,
                    horaFin: horaFin
                        ? new Date(`1970-01-01T${horaFin}:00.000Z`)
                        : null,
                    regresaATrabajar: dto.regresaATrabajar ?? false,
                    duracion: duracionCalculada,
                    motivo: dto.motivo,
                    observaciones: dto.observaciones || null,
                    solicitadoPorLider: dto.solicitadoPorLider,
                },
            });

            return nuevaSolicitud;
        });

        // 8. Guardar archivo y registro de metadatos.
        // Se conserva la ruta relativa de cada archivo para poder limpiarlo
        // si falla la operación de persistencia.
        const rutasArchivosGuardados: string[] = [];

        try {
            if (archivo) {
                if (!archivo.buffer) {
                    throw new BadRequestException(
                        'El archivo recibido no contiene datos.',
                    );
                }

                const archivoGuardado = await this.mediaPathService.saveFile(
                    archivo,
                    {
                        idTenant: activeUser.idTenant,
                        subfolder:
                            `solicitudes/incidencias/permisos/${solicitud.idSolicitud}`,
                    },
                );

                rutasArchivosGuardados.push(archivoGuardado.rutaRelativa);

                await this.prisma.archivosSolicitudes.create({
                    data: {
                        idTenant: activeUser.idTenant,
                        idEmpresa: companyId,
                        idEmpleado: dto.idEmpleado,
                        moduloSolicitud: 'INCIDENCIAS',
                        idSolicitud: solicitud.idSolicitud,
                        nombreOriginal: archivoGuardado.nombreOriginal,
                        nombreAlmacenado: archivoGuardado.nombreAlmacenado,
                        rutaRelativa: archivoGuardado.rutaRelativa,
                        mimeType: archivoGuardado.mimeType,
                        tamanoBytes: BigInt(archivoGuardado.tamanoBytes),
                        usuarioRegistro: activeUser.uuid,
                    },
                });
            }
        } catch (error) {
            // Compensación: eliminar los archivos físicos guardados.
            await Promise.all(
                rutasArchivosGuardados.map(async (ruta) => {
                    try {
                        await this.mediaPathService.deleteFile(ruta);
                    } catch {
                        // No ocultar el error original si falla la limpieza.
                    }
                }),
            );

            // Limpiar registros y solicitud incompleta.
            await this.prisma.$transaction(async (tx) => {
                await tx.archivosSolicitudes.deleteMany({
                    where: {
                        idTenant: activeUser.idTenant,
                        idEmpresa: companyId,
                        moduloSolicitud: 'INCIDENCIAS',
                        idSolicitud: solicitud.idSolicitud,
                    },
                });

                await tx.solicitudesPermisosDetalle.deleteMany({
                    where: {
                        idSolicitud: solicitud.idSolicitud,
                    },
                });

                await tx.solicitudesIncidencias.delete({
                    where: {
                        idSolicitud: solicitud.idSolicitud,
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
                'No fue posible guardar los archivos de la solicitud.',
            );
        }

        // 9. Devolver la solicitud y los archivos asociados.
        const archivos = await this.prisma.archivosSolicitudes.findMany({
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

        // Aprobar la solicitud automaticamente si no tiene flujo de aprobación
        await this.approvalsService.aprobarAutomaticamenteSinFlujoAprobacion(
            activeUser.idTenant,
            companyId,
            tipoMovimiento.idTipoMovimiento,
            solicitud.idSolicitud,
        );

        return {
            message: 'Solicitud de permiso registrada con éxito.',
            data: {
                ...solicitud,
                duracion: duracionCalculada,
                tipoDuracion: dto.tipoDuracion,
                archivos: archivos.map((archivo) => ({
                    ...archivo,
                    tamanoBytes: archivo.tamanoBytes.toString(),
                })),
            },
        };
    }
}