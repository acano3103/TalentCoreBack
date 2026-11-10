import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  AttendanceType,
  DatabaseClockRow,
  DayOfWeek,
} from './interfaces/time-clock.interface';
import { AttendanceEngineService } from '../attendance/engine/attendance-engine.service';
import { randomUUID } from 'crypto';
import { RegisterTimeClockDto } from './dto/register-time-clock.dto';
import { TipoChecada } from '../attendance/engine/state-machine';
import { CanonicalCheck } from '../attendance/engine/interfaces/canonical-check.interface';
import { Request } from 'express';

@Injectable()
export class TimeClockService {
  private readonly logger = new Logger(TimeClockService.name);

  constructor(
    private prisma: PrismaService,
    private readonly attendanceEngine: AttendanceEngineService,
  ) { }

  async findStatus(
    user: ActiveUserDto,
    companyId: number,
  ) {
    try {
      // 1. Obtener fecha y hora actuales de MySQL.
      // Se utiliza para mantener la misma referencia temporal
      // que las consultas de asistencia.
      const [databaseClock] =
        await this.prisma.$queryRaw<DatabaseClockRow[]>(
          Prisma.sql`
            SELECT
                DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS fechaActual
        `,
        );

      const currentDate = databaseClock.fechaActual;
      const now = new Date();

      // 2. Obtener al empleado asociado al usuario autenticado.
      const employee = await this.prisma.empleados.findFirst({
        where: {
          idUsuario: user.uuid,
          idEmpresa: companyId,
          activo: true,
        },
      });

      if (!employee) {
        throw new NotFoundException(
          'No se encontró un empleado activo asociado al usuario actual en esta empresa.',
        );
      }

      // 3. Obtener el día de la semana actual.
      const dayOfWeek = this.getDayOfWeek(currentDate);

      // 4. Obtener el horario del empleado para el día actual.
      const schedule = await this.prisma.horariosEmpleado.findFirst({
        where: {
          idEmpleado: employee.idEmpleado,
          DiaSemana: dayOfWeek,
        },
      });

      // 5. Determinar si el empleado puede utilizar el reloj checador web.
      const modality = schedule?.Modalidad?.trim().toUpperCase() ?? null;

      const isRemote = modality === 'REMOTO';

      let accessStatus: string;
      let accessMessage: string;

      if (!schedule) {
        accessStatus = 'SIN_HORARIO';
        accessMessage =
          'No tienes un horario configurado para el día de hoy. No es posible registrar tu asistencia desde el reloj checador web.';
      } else if (isRemote) {
        accessStatus = 'DISPONIBLE';
        accessMessage =
          'Tu modalidad de trabajo es remota. Puedes registrar tu asistencia desde la plataforma.';
      } else if (modality === 'PRESENCIAL') {
        accessStatus = 'NO_DISPONIBLE';
        accessMessage =
          'Tu modalidad de trabajo para hoy es presencial. Debes registrar tu asistencia mediante el checador de tu centro de trabajo.';
      } else {
        accessStatus = 'MODALIDAD_NO_DISPONIBLE';
        accessMessage =
          'Tu modalidad de trabajo no permite registrar asistencia desde el reloj checador web. Contacta a Recursos Humanos si necesitas más información.';
      }

      // 6. Obtener la jornada correspondiente al día actual.
      const workday = await this.prisma.jornadasEmpleado.findFirst({
        where: {
          idEmpleado: employee.idEmpleado,
          idTenant: employee.idTenant || 0,
          idEmpresa: companyId,
          fecha: new Date(`${currentDate}T00:00:00.000Z`),
        },
      });

      // 7. Obtener los registros de asistencia del día.
      const startOfDay = new Date(`${currentDate}T00:00:00`);
      const nextDay = new Date(startOfDay);
      nextDay.setDate(nextDay.getDate() + 1);

      const records = await this.prisma.registrosAsistencia.findMany({
        where: {
          idEmpleado: employee.idEmpleado,
          idEmpresa: companyId,
          fechaHoraRegistro: {
            gte: startOfDay,
            lt: nextDay,
          },
          estatusProcesamiento: {
            notIn: ['RECHAZADO', 'DUPLICADO'],
          },
        },
        orderBy: [
          {
            fechaHoraRegistro: 'asc',
          },
          {
            idRegistro: 'asc',
          },
        ],
      });

      // 8. Determinar el último evento válido.
      const lastRecord = records.length
        ? records[records.length - 1]
        : null;

      const lastEvent = (lastRecord?.tipo ?? null) as AttendanceType | null;

      // 9. Determinar las acciones disponibles.
      // Si el empleado no está en modalidad REMOTO,
      // no tendrá acciones disponibles desde la web.
      const availableActions = isRemote
        ? this.getAvailableActions(
          lastEvent,
          workday?.estatusJornada ?? null,
        )
        : [];

      // 10. Determinar el estado actual del reloj.
      const status = !schedule
        ? 'SIN_HORARIO'
        : !isRemote
          ? 'NO_DISPONIBLE'
          : this.getCurrentStatus(
            lastEvent,
            workday?.estatusJornada ?? null,
          );

      // 11. Calcular tiempo trabajado.
      const elapsedSeconds = workday
        ? this.calculateElapsedSeconds(workday, now)
        : 0;

      // 12. Calcular retraso respecto a la hora de entrada.
      const lateness = schedule
        ? this.calculateLateness(
          schedule.HoraEntrada,
          workday?.horaEntradaReal ?? null,
          now,
        )
        : {
          isLate: false,
          minutesLate: 0,
        };

      // 13. Devolver información para el frontend.
      return {
        success: true,
        message: 'Estado de asistencia obtenido correctamente.',
        data: {
          empleado: {
            idEmpleado: employee.idEmpleado,
            numeroEmpleado: employee.numeroEmpleado,
            nombre: [
              employee.nombre,
              employee.primerApellido,
              employee.segundoApellido,
            ]
              .filter(Boolean)
              .join(' '),
          },

          acceso: {
            disponible: isRemote,
            status: accessStatus,
            message: accessMessage,
            modalidad: modality,
          },

          horario: schedule
            ? {
              idHorario: schedule.idHorario,
              diaSemana: schedule.DiaSemana,
              horaEntrada: this.formatTime(schedule.HoraEntrada),
              horaSalida: this.formatTime(schedule.HoraSalida),
              modalidad: modality,
            }
            : null,

          puntualidad: {
            isLate: lateness.isLate,
            minutesLate: lateness.minutesLate,
            horaEntradaProgramada: schedule
              ? this.formatTime(schedule.HoraEntrada)
              : null,
            horaEntradaReal: workday?.horaEntradaReal ?? null,
          },

          jornada: workday
            ? {
              idJornada: workday.idJornada,
              fecha: workday.fecha,
              horaEntradaTeorica: workday.horaEntradaTeorica,
              horaSalidaTeorica: workday.horaSalidaTeorica,
              horaEntradaReal: workday.horaEntradaReal,
              horaSalidaReal: workday.horaSalidaReal,
              minutosTrabajados: workday.minutosTrabajados,
              minutosRetardo: workday.minutosRetardo,
              minutosExtraDobles: workday.minutosExtraDobles,
              minutosExtraTriples: workday.minutosExtraTriples,
              estatusJornada: workday.estatusJornada,
              horaInicioComidaReal: workday.horaInicioComidaReal,
              horaFinComidaReal: workday.horaFinComidaReal,
              minutosComida: workday.minutosComida,
              minutosComidaExcedidos:
                workday.minutosComidaExcedidos,
            }
            : null,

          status,
          lastEvent,
          lastEventAt: lastRecord?.fechaHoraRegistro ?? null,

          nextAction: availableActions[0] ?? null,
          availableActions,

          elapsedSeconds,

          records: records.map((record) => ({
            idRegistro: record.idRegistro.toString(),
            tipo: record.tipo,
            fechaHoraRegistro: record.fechaHoraRegistro,
            canal: record.canal,
            estatusProcesamiento: record.estatusProcesamiento,
          })),
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        'Error obtaining time clock status',
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }
  }

  async register(
    user: ActiveUserDto,
    companyId: number,
    dto: RegisterTimeClockDto,
    request: Request,
  ) {
    // 1. Validar que el usuario tenga identificador.
    // En este ejemplo se utiliza user.uuid porque Empleados.idUsuario
    // está relacionado con auth_user.uuid.
    if (!user.uuid) {
      throw new BadRequestException(
        'No fue posible identificar al usuario autenticado.',
      );
    }

    // 2. Buscar al empleado asociado al usuario autenticado.
    const empleado = await this.prisma.empleados.findFirst({
      where: {
        idUsuario: user.uuid,
        idEmpresa: companyId,
        activo: true,
      },
      select: {
        idEmpleado: true,
        idEmpresa: true,
        idTenant: true,
        nombre: true,
        primerApellido: true,
        segundoApellido: true,
      },
    });

    if (!empleado) {
      throw new NotFoundException(
        'No se encontró un empleado activo asociado a este usuario en la empresa seleccionada.',
      );
    }

    if (empleado.idTenant == null || empleado.idEmpresa == null) {
      throw new BadRequestException(
        'El empleado no tiene una empresa o tenant asignado.',
      );
    }

    // 3. Obtener el contexto de asistencia.
    // Esto permite utilizar la zona horaria de la sede y calcular
    // correctamente la fecha local y el día de la semana.
    const ahora = new Date();

    const contexto = await this.attendanceEngine.resolveContext(
      empleado.idEmpleado,
      ahora,
      'CLOCK_WEB',
    );

    // 4. Consultar el horario del empleado para el día local actual.
    // Se consulta nuevamente porque resolveContext no devuelve Modalidad.
    const horario = await this.prisma.horariosEmpleado.findFirst({
      where: {
        idEmpleado: empleado.idEmpleado,
        DiaSemana: contexto.diaSemana,
      },
      select: {
        idHorario: true,
        DiaSemana: true,
        HoraEntrada: true,
        HoraSalida: true,
        Modalidad: true,
      },
    });

    // 5. Validar que exista un horario.
    if (!horario) {
      throw new ForbiddenException(
        'No tienes un horario asignado para el día de hoy. No es posible registrar tu asistencia desde el reloj checador web.',
      );
    }

    // 6. Validar modalidad REMOTO.
    const modalidad = horario.Modalidad?.trim().toUpperCase();

    if (modalidad !== 'REMOTO') {
      if (modalidad === 'PRESENCIAL') {
        throw new ForbiddenException(
          'Tu modalidad de trabajo para hoy es presencial. Debes registrar tu asistencia mediante el checador de tu centro de trabajo.',
        );
      }

      throw new ForbiddenException(
        'Tu modalidad de trabajo no permite registrar asistencia desde el reloj checador web.',
      );
    }

    // 7. Validar que la acción solicitada sea válida.
    const tiposPermitidos: TipoChecada[] = [
      'ENTRADA',
      'INICIO_COMIDA',
      'FIN_COMIDA',
      'SALIDA',
    ];

    if (!tiposPermitidos.includes(dto.tipo as TipoChecada)) {
      throw new BadRequestException(
        'El tipo de asistencia solicitado no es válido.',
      );
    }

    // IP original del empleado
    const forwardedFor = request.headers["x-forwarded-for"];
    const realIp = request.headers["x-real-ip"];

    const ipOrigen =
      (typeof realIp === "string" ? realIp : null) ||
      (typeof forwardedFor === "string"
        ? forwardedFor.split(",")[0].trim()
        : null) ||
      request.ip ||
      null;

    // Navegador original del empleado
    const userAgent = request.headers["user-agent"] ?? null;

    // 8. Construir la checada canónica.
    // El motor se encargará de validar la secuencia y recalcular la jornada.
    const check: CanonicalCheck = {
      idTenant: empleado.idTenant,
      idEmpresa: empleado.idEmpresa,
      idEmpleado: empleado.idEmpleado,
      canal: 'CLOCK_WEB',
      tipo: dto.tipo,
      modoInferencia: 'SECUENCIA_COMPLETA',
      rechazoSuave: false,
      fechaHoraRegistro: new Date(),
      uuidCliente: randomUUID(),
      // Usuario autenticado
      idUsuarioRegistro: user.uuid,
      // Información de conexión
      ipOrigen: ipOrigen,
      userAgent: typeof userAgent === 'string' ? userAgent.substring(0, 1000) : null,
      // Información del navegador y dispositivo
      navegador: dto.navegador ?? null,
      versionNavegador: dto.versionNavegador ?? null,
      sistemaOperativo: dto.sistemaOperativo ?? null,
      tipoDispositivo: dto.tipoDispositivo ?? null,
      // Geolocalización
      ubicacion: dto.latitud != null && dto.longitud != null
        ? {
          latitud: dto.latitud,
          longitud: dto.longitud,
          precisionMetros: dto.precisionMetros,
          esSimulada: dto.ubicacionSimulada ?? false,
        }
        : null,
    };

    // 9. Registrar mediante el motor central de asistencia.
    const resultado = await this.attendanceEngine.registerCheck(check);

    if (resultado.rechazado) {
      throw new BadRequestException(
        resultado.motivoRechazo ||
        'No fue posible registrar tu asistencia.',
      );
    }

    // 10. Respuesta para el frontend.
    const nombreEmpleado = [
      empleado.nombre,
      empleado.primerApellido,
      empleado.segundoApellido,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      success: true,
      message: `Tu registro de ${dto.tipo.toLowerCase().replace('_', ' ')} se realizó correctamente.`,
      data: {
        idRegistro: resultado.idRegistro,
        idJornada: resultado.idJornada,
        tipo: resultado.tipo,
        fechaHora: ahora,
        empleado: nombreEmpleado,
        resultadoGeocerca: resultado.resultadoGeocerca,
        requiereRevision: resultado.requiereRevision,
        advertencias: resultado.advertencias,
        jornada: resultado.jornada,
      },
    };
  }

  // --------------------------------------------------
  // Helpers 
  // --------------------------------------------------

  /**
   * Obtiene el día de la semana en español.
   */
  private getDayOfWeek(date: string): DayOfWeek {
    const [year, month, day] = date.split('-').map(Number);

    // Se utiliza UTC para evitar que la zona horaria del servidor
    // modifique el día de la fecha recibida desde MySQL.
    const dateObject = new Date(
      Date.UTC(year, month - 1, day),
    );

    const days: DayOfWeek[] = [
      'Domingo',
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
    ];

    return days[dateObject.getUTCDay()];
  }

  /**
   * Convierte la fecha y hora devuelta por MySQL a Date.
   */
  private parseDatabaseDateTime(value: string): Date {
    return new Date(value.replace(' ', 'T'));
  }

  /**
   * Formatea un campo TIME de MySQL.
   * Prisma puede representarlo como Date o string,
   * dependiendo de la definición del modelo.
   */
  private formatTime(value: Date | string | null): string | null {
    if (!value) return null;

    if (typeof value === 'string') {
      return value.substring(0, 8);
    }

    const hours = String(value.getUTCHours()).padStart(2, '0');
    const minutes = String(value.getUTCMinutes()).padStart(2, '0');
    const seconds = String(value.getUTCSeconds()).padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Calcula los segundos trabajados durante la jornada,
   * descontando el tiempo de comida.
   */
  private calculateElapsedSeconds(
    workday: {
      horaEntradaReal: Date | null;
      horaSalidaReal: Date | null;
      horaInicioComidaReal: Date | null;
      horaFinComidaReal: Date | null;
    },
    now: Date,
  ): number {
    if (!workday.horaEntradaReal) {
      return 0;
    }

    const endTime = workday.horaSalidaReal ?? now;

    let totalSeconds = Math.max(
      0,
      Math.floor(
        (endTime.getTime() - workday.horaEntradaReal.getTime()) / 1000,
      ),
    );

    if (workday.horaInicioComidaReal) {
      const mealEnd =
        workday.horaFinComidaReal ?? endTime;

      const mealSeconds = Math.max(
        0,
        Math.floor(
          (mealEnd.getTime() -
            workday.horaInicioComidaReal.getTime()) /
          1000,
        ),
      );

      totalSeconds -= mealSeconds;
    }

    return Math.max(0, totalSeconds);
  }

  /**
   * Calcula si el empleado tiene retraso respecto a su horario.
   *
   * Si todavía no registra entrada, compara la hora actual
   * con la hora programada.
   *
   * Si ya registró entrada, compara la hora real de entrada
   * con la hora programada.
   */
  private calculateLateness(
    scheduledEntry: Date | string | null,
    actualEntry: Date | null,
    now: Date,
  ): {
    isLate: boolean;
    minutesLate: number;
  } {
    if (!scheduledEntry) {
      return {
        isLate: false,
        minutesLate: 0,
      };
    }

    const scheduledTime = this.formatTime(scheduledEntry);

    if (!scheduledTime) {
      return {
        isLate: false,
        minutesLate: 0,
      };
    }

    const [scheduledHours, scheduledMinutes] = scheduledTime
      .split(':')
      .map(Number);

    const scheduledTotalMinutes =
      scheduledHours * 60 + scheduledMinutes;

    let referenceTotalMinutes: number;

    if (actualEntry) {
      referenceTotalMinutes =
        actualEntry.getHours() * 60 +
        actualEntry.getMinutes();
    } else {
      referenceTotalMinutes =
        now.getHours() * 60 +
        now.getMinutes();
    }

    const minutesLate = Math.max(
      0,
      referenceTotalMinutes - scheduledTotalMinutes,
    );

    return {
      isLate: minutesLate > 0,
      minutesLate,
    };
  }

  private getAvailableActions(
    lastEvent: AttendanceType | null,
    workdayStatus: string | null,
  ): AttendanceType[] {
    if (
      workdayStatus === 'DESCANSO' ||
      workdayStatus === 'FALTA'
    ) {
      return [];
    }

    if (
      workdayStatus === 'CERRADA' ||
      workdayStatus === 'CIERRE_AUTOMATICO'
    ) {
      return [];
    }

    switch (lastEvent) {
      case null:
        return ['ENTRADA'];

      case 'ENTRADA':
        return ['INICIO_COMIDA', 'SALIDA'];

      case 'INICIO_COMIDA':
        return ['FIN_COMIDA'];

      case 'FIN_COMIDA':
        return ['SALIDA'];

      case 'SALIDA':
        return [];

      default:
        return [];
    }
  }

  private getCurrentStatus(
    lastEvent: AttendanceType | null,
    workdayStatus: string | null,
  ): string {
    if (workdayStatus === 'DESCANSO') {
      return 'DESCANSO';
    }

    if (workdayStatus === 'FALTA') {
      return 'FALTA';
    }

    if (
      workdayStatus === 'CERRADA' ||
      workdayStatus === 'CIERRE_AUTOMATICO'
    ) {
      return 'FINALIZADA';
    }

    switch (lastEvent) {
      case null:
        return 'SIN_INICIAR';

      case 'ENTRADA':
        return 'TRABAJANDO';

      case 'INICIO_COMIDA':
        return 'EN_COMIDA';

      case 'FIN_COMIDA':
        return 'TRABAJANDO';

      case 'SALIDA':
        return 'FINALIZADA';

      default:
        return 'SIN_INICIAR';
    }
  }
}