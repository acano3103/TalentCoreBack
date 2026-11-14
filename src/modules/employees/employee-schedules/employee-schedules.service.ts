
import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';

import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';

import {
    EmployeeCalendarDayType,
    SaveEmployeeCalendarDayDto,
} from './dto/save-employee-calendar-day.dto';

@Injectable()
export class EmployeeSchedulesService {
    constructor(
        private prisma: PrismaService,
    ) { }

    /**
     * Convierte una fecha DATE de MySQL a YYYY-MM-DD
     * sin aplicar conversiones de zona horaria.
     */
    private formatDatabaseDate(value: Date | string): string {
        if (value instanceof Date) {
            const year = value.getUTCFullYear();
            const month = String(value.getUTCMonth() + 1).padStart(2, '0');
            const day = String(value.getUTCDate()).padStart(2, '0');

            return `${year}-${month}-${day}`;
        }

        return String(value).slice(0, 10);
    }

    /**
     * Obtiene empleados paginados con:
     * - Horario semanal base.
     * - Excepciones personalizadas del calendario.
     * - Incidencias aprobadas: vacaciones, incapacidades y permisos.
     *
     * Las incidencias se consultan cuando sus fechas se cruzan
     * con el periodo mensual solicitado.
     */
    async findEmployeesMonthlySchedules(
        activeUser: ActiveUserDto,
        companyId: number,
        filters: {
            page?: number;
            limit?: number;
            month?: number;
            year?: number;
            search?: string;
            idSite?: string;
            idUnidadOperativa?: string;
            idArea?: string;
        },
    ) {
        if (!activeUser.idTenant) {
            throw new InternalServerErrorException(
                'El usuario no tiene un tenant asignado.',
            );
        }

        const page = filters.page ?? 1;
        const limit = filters.limit ?? 25;
        const now = new Date();

        const month = filters.month ?? now.getMonth() + 1;
        const year = filters.year ?? now.getFullYear();

        if (!Number.isInteger(page) || page < 1) {
            throw new BadRequestException(
                'El número de página no es válido.',
            );
        }

        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            throw new BadRequestException(
                'El límite debe ser un número entre 1 y 100.',
            );
        }

        if (!Number.isInteger(month) || month < 1 || month > 12) {
            throw new BadRequestException(
                'El mes debe estar entre 1 y 12.',
            );
        }

        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
            throw new BadRequestException(
                'El año no es válido.',
            );
        }

        const parseOptionalId = (
            value?: string,
        ): number | undefined => {
            if (!value?.trim()) return undefined;

            const parsed = Number(value);

            if (!Number.isInteger(parsed) || parsed <= 0) {
                throw new BadRequestException(
                    `El filtro "${value}" no contiene un identificador válido.`,
                );
            }

            return parsed;
        };

        const idSite = parseOptionalId(filters.idSite);
        const idUnidadOperativa = parseOptionalId(
            filters.idUnidadOperativa,
        );
        const idArea = parseOptionalId(filters.idArea);

        const skip = (page - 1) * limit;
        const search = filters.search?.trim();

        const searchCondition = search
            ? Prisma.sql`
                AND (
                    ep.numeroEmpleado LIKE ${`%${search}%`}
                    OR ep.nombre LIKE ${`%${search}%`}
                    OR ep.primerApellido LIKE ${`%${search}%`}
                    OR ep.segundoApellido LIKE ${`%${search}%`}
                    OR ep.correo LIKE ${`%${search}%`}
                    OR p.NombrePuesto LIKE ${`%${search}%`}
                )
            `
            : Prisma.empty;

        const siteCondition = idSite
            ? Prisma.sql`AND ep.idSite = ${idSite}`
            : Prisma.empty;

        const operationalUnitCondition = idUnidadOperativa
            ? Prisma.sql`AND s.idUnidadOperativa = ${idUnidadOperativa}`
            : Prisma.empty;

        const areaCondition = idArea
            ? Prisma.sql`AND p.idArea = ${idArea}`
            : Prisma.empty;

        // Rango del mes solicitado, sin conversiones de zona horaria.
        const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;

        const lastDayNumber = new Date(
            Date.UTC(year, month, 0),
        ).getUTCDate();

        const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(
            lastDayNumber,
        ).padStart(2, '0')}`;

        // 1. Empleados paginados.
        const employeesPromise = this.prisma.$queryRaw<any[]>`
            SELECT
                ep.idEmpleado,
                ep.numeroEmpleado,
                ep.nombre,
                ep.primerApellido,
                ep.segundoApellido,
                ep.idSite,
                s.Descripcion AS nombreSite,
                s.idUnidadOperativa,
                p.idPuesto,
                p.NombrePuesto AS nombrePuesto,
                p.idArea,
                a.Descripcion AS nombreArea
            FROM Empleados ep
            LEFT JOIN CatPuestos p
                ON p.idPuesto = ep.idPuesto
            LEFT JOIN CatAreas a
                ON a.idArea = p.idArea
            LEFT JOIN CatSites s
                ON s.idSite = ep.idSite
            WHERE ep.idEmpresa = ${companyId}
                AND ep.idTenant = ${activeUser.idTenant}
                AND ep.activo = 1
                ${searchCondition}
                ${siteCondition}
                ${operationalUnitCondition}
                ${areaCondition}
            ORDER BY
                ep.nombre ASC,
                ep.primerApellido ASC
            LIMIT ${limit}
            OFFSET ${skip};
        `;

        // 2. Total de empleados con los mismos filtros.
        const totalPromise = this.prisma.$queryRaw<
            { total: number | bigint }[]
        >`
            SELECT COUNT(DISTINCT ep.idEmpleado) AS total
            FROM Empleados ep
            LEFT JOIN CatPuestos p
                ON p.idPuesto = ep.idPuesto
            LEFT JOIN CatAreas a
                ON a.idArea = p.idArea
            LEFT JOIN CatSites s
                ON s.idSite = ep.idSite
            WHERE ep.idEmpresa = ${companyId}
                AND ep.idTenant = ${activeUser.idTenant}
                AND ep.activo = 1
                ${searchCondition}
                ${siteCondition}
                ${operationalUnitCondition}
                ${areaCondition};
        `;

        const [employees, totalResult] = await Promise.all([
            employeesPromise,
            totalPromise,
        ]);

        const total = Number(totalResult[0]?.total ?? 0);
        const totalPages = Math.ceil(total / limit);

        if (employees.length === 0) {
            return {
                data: [],
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                },
                period: {
                    month,
                    year,
                    firstDay,
                    lastDay,
                },
            };
        }

        const employeeIds = employees.map(
            (employee) => Number(employee.idEmpleado),
        );

        // 3. Horarios semanales base.
        const weeklySchedules = await this.prisma.$queryRaw<any[]>`
            SELECT
                idHorario,
                idEmpleado,
                DiaSemana,
                HoraEntrada,
                HoraSalida,
                Modalidad
            FROM HorariosEmpleado
            WHERE idEmpleado IN (${Prisma.join(employeeIds)})
            ORDER BY
                idEmpleado ASC,
                FIELD(
                    DiaSemana,
                    'Lunes',
                    'Martes',
                    'Miércoles',
                    'Miercoles',
                    'Jueves',
                    'Viernes',
                    'Sábado',
                    'Sabado',
                    'Domingo'
                ),
                HoraEntrada ASC;
        `;

        // 4. Excepciones personalizadas del calendario.
        const customSchedules = await this.prisma.$queryRaw<any[]>`
            SELECT
                c.idCalendario,
                c.idEmpleado,
                c.fecha,
                c.tipoDia,
                c.observaciones,
                d.idDetalle,
                d.numeroTurno,
                d.HoraEntrada,
                d.HoraSalida,
                d.Modalidad
            FROM CalendarioLaboralEmpleado c
            LEFT JOIN DetalleCalendarioLaboralEmpleado d
                ON d.idCalendario = c.idCalendario
            WHERE c.idEmpleado IN (${Prisma.join(employeeIds)})
                AND c.fecha >= ${firstDay}
                AND c.fecha <= ${lastDay}
            ORDER BY
                c.idEmpleado ASC,
                c.fecha ASC,
                d.numeroTurno ASC;
        `;

        // 5. Incidencias aprobadas que coinciden con el periodo.
        //
        // La condición de fechas permite recuperar también solicitudes
        // que comenzaron en un mes anterior y terminan en el actual,
        // o que comenzaron en el actual y terminan en uno posterior.
        //
        // Los detalles se identifican por la existencia de su registro
        // relacionado, sin depender de IDs fijos de CatTipoMovimiento.
        const approvedIncidents = await this.prisma.$queryRaw<any[]>`
            SELECT
                si.idSolicitud,
                si.idTenant,
                si.idEmpresa,
                si.idEmpleado,
                si.idTipoMovimiento,

                DATE_FORMAT(si.fechaInicio, '%Y-%m-%d') AS fechaInicio,
                DATE_FORMAT(si.fechaFin, '%Y-%m-%d') AS fechaFin,

                si.totalDiasLaborales,
                si.estatus,
                si.comentarios,
                si.fechaRespuesta,

                CASE
                    WHEN sv.idVacacionDetalle IS NOT NULL
                        THEN 'VACACIONES'

                    WHEN sinc.idIncapacidadDetalle IS NOT NULL
                        THEN 'INCAPACIDAD'

                    WHEN sp.idPermisoDetalle IS NOT NULL
                        THEN 'PERMISO'

                    ELSE 'OTRA'
                END AS tipoIncidencia,

                -- Información de vacaciones.
                sv.idVacacionDetalle,
                sv.periodoAnio,
                sv.diasPrimaVacacional,

                -- Información de incapacidades.
                sinc.idIncapacidadDetalle,
                sinc.tipoIncapacidad,
                sinc.numeroCertificado,
                sinc.institucionMedica,
                sinc.observaciones AS observacionesIncapacidad,

                -- Información de permisos.
                sp.idPermisoDetalle,
                sp.tipoPermiso,
                sp.tipoGoce,
                sp.tipoDuracion,
                sp.horaInicio,
                sp.horaFin,
                sp.regresaATrabajar,
                sp.duracion,
                sp.motivo,
                sp.observaciones AS observacionesPermiso

            FROM SolicitudesIncidencias si

            LEFT JOIN SolicitudesVacacionesDetalle sv
                ON sv.idSolicitud = si.idSolicitud

            LEFT JOIN SolicitudesIncapacidadesDetalle sinc
                ON sinc.idSolicitud = si.idSolicitud

            LEFT JOIN SolicitudesPermisosDetalle sp
                ON sp.idSolicitud = si.idSolicitud

            WHERE si.idEmpleado IN (${Prisma.join(employeeIds)})
                AND si.idEmpresa = ${companyId}
                AND si.idTenant = ${activeUser.idTenant}
                AND si.estatus = 'APROBADA'

                -- Solicitudes que se cruzan con el mes solicitado.
                AND si.fechaInicio <= ${lastDay}
                AND si.fechaFin >= ${firstDay}

            ORDER BY
                si.idEmpleado ASC,
                si.fechaInicio ASC,
                si.idSolicitud ASC;
        `;

        // 6. Agrupar horarios semanales por empleado.
        const weeklyByEmployee = new Map<number, any[]>();

        for (const schedule of weeklySchedules) {
            const employeeId = Number(schedule.idEmpleado);

            if (!weeklyByEmployee.has(employeeId)) {
                weeklyByEmployee.set(employeeId, []);
            }

            weeklyByEmployee.get(employeeId)!.push({
                idHorario: Number(schedule.idHorario),
                DiaSemana: schedule.DiaSemana,
                HoraEntrada: schedule.HoraEntrada,
                HoraSalida: schedule.HoraSalida,
                Modalidad: schedule.Modalidad,
            });
        }

        // 7. Agrupar excepciones personalizadas por empleado y fecha.
        const customByEmployee = new Map<
            number,
            Map<string, any>
        >();

        for (const schedule of customSchedules) {
            const employeeId = Number(schedule.idEmpleado);
            const fecha = this.formatDatabaseDate(schedule.fecha);

            if (!customByEmployee.has(employeeId)) {
                customByEmployee.set(employeeId, new Map());
            }

            const employeeDates = customByEmployee.get(employeeId)!;

            if (!employeeDates.has(fecha)) {
                employeeDates.set(fecha, {
                    idCalendario: Number(schedule.idCalendario),
                    fecha,
                    tipoDia: schedule.tipoDia,
                    observaciones: schedule.observaciones,
                    turnos: [],
                });
            }

            if (schedule.idDetalle !== null) {
                employeeDates.get(fecha).turnos.push({
                    idDetalle: Number(schedule.idDetalle),
                    numeroTurno: Number(schedule.numeroTurno),
                    HoraEntrada: schedule.HoraEntrada,
                    HoraSalida: schedule.HoraSalida,
                    Modalidad: schedule.Modalidad,
                });
            }
        }

        // 8. Agrupar incidencias aprobadas por empleado.
        const incidentsByEmployee = new Map<number, any[]>();

        for (const incident of approvedIncidents) {
            const employeeId = Number(incident.idEmpleado);

            if (!incidentsByEmployee.has(employeeId)) {
                incidentsByEmployee.set(employeeId, []);
            }

            incidentsByEmployee.get(employeeId)!.push({
                idSolicitud: Number(incident.idSolicitud),
                idTipoMovimiento: Number(incident.idTipoMovimiento),

                tipoIncidencia: incident.tipoIncidencia,

                fechaInicio: incident.fechaInicio,
                fechaFin: incident.fechaFin,

                totalDiasLaborales: Number(
                    incident.totalDiasLaborales ?? 0,
                ),

                estatus: incident.estatus,
                comentarios: incident.comentarios,
                fechaRespuesta: incident.fechaRespuesta,

                // Datos de vacaciones.
                vacaciones: incident.idVacacionDetalle
                    ? {
                        idVacacionDetalle: Number(
                            incident.idVacacionDetalle,
                        ),
                        periodoAnio: Number(incident.periodoAnio),
                        diasPrimaVacacional: Number(
                            incident.diasPrimaVacacional ?? 0,
                        ),
                    }
                    : null,

                // Datos de incapacidad.
                incapacidad: incident.idIncapacidadDetalle
                    ? {
                        idIncapacidadDetalle: Number(
                            incident.idIncapacidadDetalle,
                        ),
                        tipoIncapacidad: incident.tipoIncapacidad,
                        numeroCertificado: incident.numeroCertificado,
                        institucionMedica: incident.institucionMedica,
                        observaciones: incident.observacionesIncapacidad,
                    }
                    : null,

                // Datos de permiso.
                permiso: incident.idPermisoDetalle
                    ? {
                        idPermisoDetalle: Number(
                            incident.idPermisoDetalle,
                        ),
                        tipoPermiso: incident.tipoPermiso,
                        tipoGoce: incident.tipoGoce,
                        tipoDuracion: incident.tipoDuracion,
                        horaInicio: incident.horaInicio,
                        horaFin: incident.horaFin,
                        regresaATrabajar: Boolean(
                            incident.regresaATrabajar,
                        ),
                        duracion: Number(incident.duracion ?? 0),
                        motivo: incident.motivo,
                        observaciones: incident.observacionesPermiso,
                    }
                    : null,
            });
        }

        // 9. Construir respuesta final.
        const data = employees.map((employee) => {
            const employeeId = Number(employee.idEmpleado);

            const employeeDates = customByEmployee.get(employeeId);
            const employeeIncidents = incidentsByEmployee.get(employeeId);

            return {
                ...employee,

                idEmpleado: employeeId,

                horarioSemanal:
                    weeklyByEmployee.get(employeeId) ?? [],

                programacionesPersonalizadas: employeeDates
                    ? Array.from(employeeDates.values())
                    : [],

                incidenciasAprobadas:
                    employeeIncidents ?? [],
            };
        });

        return {
            data,

            pagination: {
                total,
                page,
                limit,
                totalPages,
            },

            period: {
                month,
                year,
                firstDay,
                lastDay,
            },
        };
    }

    /**
     * Valida que la fecha tenga formato YYYY-MM-DD
     * y que sea una fecha real.
     */
    private validateDate(date: string): void {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            throw new BadRequestException(
                'La fecha debe tener el formato YYYY-MM-DD.',
            );
        }

        const [year, month, day] = date.split('-').map(Number);

        const parsed = new Date(
            Date.UTC(year, month - 1, day),
        );

        if (
            parsed.getUTCFullYear() !== year ||
            parsed.getUTCMonth() !== month - 1 ||
            parsed.getUTCDate() !== day
        ) {
            throw new BadRequestException(
                'La fecha proporcionada no es válida.',
            );
        }
    }

    /**
     * Valida los turnos de una programación.
     */
    private validateDay(dto: SaveEmployeeCalendarDayDto): void {
        if (!Array.isArray(dto.turnos)) {
            throw new BadRequestException(
                'El campo turnos debe ser un arreglo.',
            );
        }

        if (dto.tipoDia === EmployeeCalendarDayType.DESCANSO) {
            if (dto.turnos.length > 0) {
                throw new BadRequestException(
                    'Un día de descanso no puede contener turnos.',
                );
            }

            return;
        }

        if (dto.tipoDia === EmployeeCalendarDayType.LABORAL) {
            if (dto.turnos.length === 0) {
                throw new BadRequestException(
                    'Un día laboral debe tener al menos un turno.',
                );
            }

            const turnosOrdenados = [...dto.turnos].sort(
                (a, b) => a.HoraEntrada.localeCompare(b.HoraEntrada),
            );

            for (let i = 0; i < turnosOrdenados.length; i++) {
                const turno = turnosOrdenados[i];

                if (turno.HoraEntrada >= turno.HoraSalida) {
                    throw new BadRequestException(
                        `El turno ${i + 1} debe tener una hora de salida posterior a su hora de entrada. Los turnos que cruzan medianoche requieren una regla específica y no están habilitados en esta versión.`,
                    );
                }

                if (i > 0) {
                    const turnoAnterior = turnosOrdenados[i - 1];

                    if (
                        turno.HoraEntrada <
                        turnoAnterior.HoraSalida
                    ) {
                        throw new BadRequestException(
                            'Los turnos de un mismo día no pueden traslaparse.',
                        );
                    }
                }
            }
        }
    }

    /**
     * Verifica que el empleado exista en la empresa y tenant.
     */
    private async validateEmployee(
        companyId: number,
        employeeId: number,
        user: ActiveUserDto,
    ) {
        if (!user.idTenant) {
            throw new InternalServerErrorException(
                'El usuario no tiene un tenant asignado.',
            );
        }

        const employee = await this.prisma.empleados.findFirst({
            where: {
                idEmpleado: employeeId,
                idEmpresa: companyId,
                idTenant: user.idTenant,
                activo: true,
            },
            select: {
                idEmpleado: true,
                numeroEmpleado: true,
                nombre: true,
                primerApellido: true,
            },
        });

        if (!employee) {
            throw new NotFoundException(
                'El empleado no existe o no pertenece a la empresa seleccionada.',
            );
        }

        return employee;
    }

    /**
     * Consulta la programación personalizada de una fecha.
     */
    async findCustomDay(
        user: ActiveUserDto,
        companyId: number,
        employeeId: number,
        date: string,
    ) {
        this.validateDate(date);

        await this.validateEmployee(
            companyId,
            employeeId,
            user,
        );

        const rows = await this.prisma.$queryRaw<any[]>`
            SELECT
                c.idCalendario,
                c.idEmpleado,
                c.fecha,
                c.tipoDia,
                c.observaciones,
                d.idDetalle,
                d.numeroTurno,
                d.HoraEntrada,
                d.HoraSalida,
                d.Modalidad
            FROM CalendarioLaboralEmpleado c
            LEFT JOIN DetalleCalendarioLaboralEmpleado d
                ON d.idCalendario = c.idCalendario
            WHERE c.idEmpleado = ${employeeId}
                AND c.fecha = ${date}
            ORDER BY d.numeroTurno ASC;
        `;

        if (rows.length === 0) {
            return {
                personalizada: false,
                idEmpleado: employeeId,
                fecha: date,
                message:
                    'No existe una programación personalizada para esta fecha. Se debe utilizar el horario semanal.',
            };
        }

        const header = rows[0];

        return {
            personalizada: true,
            idCalendario: Number(header.idCalendario),
            idEmpleado: Number(header.idEmpleado),
            fecha: this.formatDatabaseDate(header.fecha),
            tipoDia: header.tipoDia,
            observaciones: header.observaciones,

            turnos: rows
                .filter((row) => row.idDetalle !== null)
                .map((row) => ({
                    idDetalle: Number(row.idDetalle),
                    numeroTurno: Number(row.numeroTurno),
                    HoraEntrada: row.HoraEntrada,
                    HoraSalida: row.HoraSalida,
                    Modalidad: row.Modalidad,
                })),
        };
    }

    /**
     * Crea o actualiza la programación personalizada de una fecha.
     */
    async saveCustomDay(
        user: ActiveUserDto,
        companyId: number,
        employeeId: number,
        date: string,
        dto: SaveEmployeeCalendarDayDto,
    ) {
        this.validateDate(date);
        this.validateDay(dto);

        const employee = await this.validateEmployee(
            companyId,
            employeeId,
            user,
        );

        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.$queryRaw<
                { idCalendario: number | bigint }[]
            >`
                SELECT idCalendario
                FROM CalendarioLaboralEmpleado
                WHERE idEmpleado = ${employeeId}
                    AND fecha = ${date}
                LIMIT 1;
            `;

            let idCalendario: number;

            if (existing.length > 0) {
                idCalendario = Number(existing[0].idCalendario);

                await tx.$executeRaw`
                    UPDATE CalendarioLaboralEmpleado
                    SET
                        tipoDia = ${dto.tipoDia},
                        observaciones = ${dto.observaciones ?? null}
                    WHERE idCalendario = ${idCalendario};
                `;

                await tx.$executeRaw`
                    DELETE FROM DetalleCalendarioLaboralEmpleado
                    WHERE idCalendario = ${idCalendario};
                `;
            } else {
                await tx.$executeRaw`
                    INSERT INTO CalendarioLaboralEmpleado (
                        idEmpleado,
                        fecha,
                        tipoDia,
                        observaciones
                    )
                    VALUES (
                        ${employeeId},
                        ${date},
                        ${dto.tipoDia},
                        ${dto.observaciones ?? null}
                    );
                `;

                const inserted = await tx.$queryRaw<
                    { idCalendario: number | bigint }[]
                >`
                    SELECT idCalendario
                    FROM CalendarioLaboralEmpleado
                    WHERE idEmpleado = ${employeeId}
                        AND fecha = ${date}
                    LIMIT 1;
                `;

                if (inserted.length === 0) {
                    throw new InternalServerErrorException(
                        'No fue posible recuperar la programación creada.',
                    );
                }

                idCalendario = Number(inserted[0].idCalendario);
            }

            if (
                dto.tipoDia === EmployeeCalendarDayType.LABORAL &&
                dto.turnos.length > 0
            ) {
                for (
                    let index = 0;
                    index < dto.turnos.length;
                    index++
                ) {
                    const turno = dto.turnos[index];

                    const numeroTurno =
                        turno.numeroTurno ?? index + 1;

                    await tx.$executeRaw`
                        INSERT INTO DetalleCalendarioLaboralEmpleado (
                            idCalendario,
                            numeroTurno,
                            HoraEntrada,
                            HoraSalida,
                            Modalidad
                        )
                        VALUES (
                            ${idCalendario},
                            ${numeroTurno},
                            ${turno.HoraEntrada},
                            ${turno.HoraSalida},
                            ${turno.Modalidad}
                        );
                    `;
                }
            }

            await tx.historicoMovimientos.create({
                data: {
                    idUsuario: user.id,
                    idEmpresa: companyId,
                    accion: existing.length > 0
                        ? 'ACTUALIZAR'
                        : 'CREAR',
                    tablaOrigen: 'CalendarioLaboralEmpleado',
                    idRegistro: String(idCalendario),
                    descripcion:
                        `El usuario ${user.username} ${existing.length > 0 ? 'actualizó' : 'registró'
                        } la programación del empleado ${employee.numeroEmpleado ?? employeeId
                        } para el día ${date}.`,
                    fechaCreacion: new Date(),
                },
            });

            return {
                success: true,
                message: existing.length > 0
                    ? 'La programación del día se actualizó correctamente.'
                    : 'La programación del día se registró correctamente.',
                idCalendario,
                idEmpleado: employeeId,
                fecha: date,
                tipoDia: dto.tipoDia,
                turnos: dto.turnos.map((turno, index) => ({
                    ...turno,
                    numeroTurno: turno.numeroTurno ?? index + 1,
                })),
            };
        });
    }

    /**
     * Elimina la excepción de una fecha.
     */
    async deleteCustomDay(
        user: ActiveUserDto,
        companyId: number,
        employeeId: number,
        date: string,
    ) {
        this.validateDate(date);

        const employee = await this.validateEmployee(
            companyId,
            employeeId,
            user,
        );

        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.$queryRaw<
                { idCalendario: number | bigint }[]
            >`
                SELECT idCalendario
                FROM CalendarioLaboralEmpleado
                WHERE idEmpleado = ${employeeId}
                    AND fecha = ${date}
                LIMIT 1;
            `;

            if (existing.length === 0) {
                throw new NotFoundException(
                    'No existe una programación personalizada para esa fecha.',
                );
            }

            const idCalendario = Number(existing[0].idCalendario);

            await tx.$executeRaw`
                DELETE FROM DetalleCalendarioLaboralEmpleado
                WHERE idCalendario = ${idCalendario};
            `;

            await tx.$executeRaw`
                DELETE FROM CalendarioLaboralEmpleado
                WHERE idCalendario = ${idCalendario};
            `;

            await tx.historicoMovimientos.create({
                data: {
                    idUsuario: user.id,
                    idEmpresa: companyId,
                    accion: 'ELIMINAR',
                    tablaOrigen: 'CalendarioLaboralEmpleado',
                    idRegistro: String(idCalendario),
                    descripcion:
                        `El usuario ${user.username} eliminó la programación personalizada del empleado ${employee.numeroEmpleado ?? employeeId
                        } para el día ${date}. El día volverá a utilizar su horario semanal.`,
                    fechaCreacion: new Date(),
                },
            });

            return {
                success: true,
                message:
                    'La programación personalizada se eliminó. El día volverá a utilizar el horario semanal.',
                idEmpleado: employeeId,
                fecha: date,
            };
        });
    }
}