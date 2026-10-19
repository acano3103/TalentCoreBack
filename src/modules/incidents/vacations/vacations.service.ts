// src/modules/incidents/vacations/vacations.service.ts

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmployeesService } from 'src/modules/employees/employees.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PersonnelConfigService } from 'src/modules/config/personnel-config/personnel-config.service';
import { EmployeeQueryResult } from 'src/modules/employees/interfaces/employee.interface';
import { SolicitudesIncidencias_estatus } from 'generated/prisma/enums';
import { CreateVacationRequestDto } from './dto/create-vacation-request.dto';
import { DIAS_SEMANA_MAP } from '../constants/incidents.constants';
import { ApprovalsService } from 'src/modules/approvals/approvals.service';

@Injectable()
export class VacationsService {
  private readonly logger = new Logger(VacationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeService: EmployeesService,
    private readonly personnelConfig: PersonnelConfigService,
    private readonly approvalsService: ApprovalsService,
  ) { }

  /**
   * Tabla legal de Vacaciones Dignas (LFT México)
   */
  private calculateLegalVacationDays(completedYears: number): number {
    if (completedYears < 1) return 0;
    if (completedYears === 1) return 12;
    if (completedYears === 2) return 14;
    if (completedYears === 3) return 16;
    if (completedYears === 4) return 18;
    if (completedYears === 5) return 20;
    if (completedYears <= 10) return 22;
    if (completedYears <= 15) return 24;
    if (completedYears <= 20) return 26;
    if (completedYears <= 25) return 28;
    if (completedYears <= 30) return 30;
    return 32;
  }

  async getEmployeeBalance(activeUser: ActiveUserDto, companyId: number, employeeId: number) {
    // 1. Obtener datos del empleado
    const employee = await this.employeeService.findOne(companyId, employeeId);
    if (!employee) {
      throw new NotFoundException('El empleado solicitado no existe o no pertenece a la empresa.');
    }

    // 2. Obtener configuración de personal para la empresa
    const config = await this.personnelConfig.getConfiguracionPersonal(activeUser.idTenant, companyId);
    const vacationRules = config?.vacaciones ?? {
      diasAnticipacionMinima: 30,
      mesesBloqueados: [12],
      permitirSaldoNegativo: false,
      diasMinimosPorSolicitud: 1,
    };

    // 3. Cálculo de Antigüedad
    const hireDate = new Date(employee.fechaIngreso);
    const today = new Date();

    let completedYears = today.getFullYear() - hireDate.getFullYear();
    const currentMonth = today.getMonth();
    const hireMonth = hireDate.getMonth();

    if (
      currentMonth < hireMonth ||
      (currentMonth === hireMonth && today.getDate() < hireDate.getDate())
    ) {
      completedYears--;
    }

    const seniorityYears = Math.max(0, completedYears);
    const entitledDays = this.calculateLegalVacationDays(seniorityYears);

    // 4. Consultar solicitudes previas en SolicitudesPersonal vinculadas a VACACIONES
    let usedDays = 0;
    let pendingDays = 0;

    try {
      const vacationRequests = await this.prisma.solicitudesIncidencias.findMany({
        where: {
          idEmpresa: companyId,
          idTenant: activeUser.idTenant,
          idEmpleado: employeeId,
          CatTipoMovimiento: {
            codigo: 'VACACIONES',
          },
          estatus: {
            in: ['APROBADA', 'PENDIENTE'],
          },
        },
        select: {
          totalDiasLaborales: true,
          estatus: true,
        },
      });

      for (const req of vacationRequests) {
        const days = Number(req.totalDiasLaborales);
        if (req.estatus === 'APROBADA') {
          usedDays += days;
        } else if (req.estatus === 'PENDIENTE') {
          pendingDays += days;
        }
      }
    } catch (error) {
      this.logger.warn(`No se pudieron consultar solicitudes previas: ${error.message}`);
    }

    const availableDays = entitledDays - (usedDays + pendingDays);

    // 5. Analizar días laborales y descansos a partir de los horarios del empleado
    const workingDaysSet = new Set<number>();
    if (Array.isArray(employee.horarios)) {
      employee.horarios.forEach((h: { DiaSemana: string }) => {
        const normalized = h.DiaSemana?.trim().toLowerCase();
        if (normalized && DIAS_SEMANA_MAP[normalized] !== undefined) {
          workingDaysSet.add(DIAS_SEMANA_MAP[normalized]);
        }
      });
    }

    // Default si no tiene horario configurado: Lunes a Viernes (1 a 5)
    const workingDays = workingDaysSet.size > 0 ? Array.from(workingDaysSet) : [1, 2, 3, 4, 5];
    const restDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !workingDays.includes(d));

    // 6. Restricciones corporativas de fecha
    const minNoticeDays = vacationRules.diasAnticipacionMinima ?? 0;
    const earliestAllowedDate = new Date(today);
    earliestAllowedDate.setDate(earliestAllowedDate.getDate() + minNoticeDays);

    return {
      employee: {
        idEmpleado: employee.idEmpleado,
        numeroEmpleado: employee.numeroEmpleado,
        nombreCompleto: `${employee.nombre} ${employee.primerApellido} ${employee.segundoApellido || ''}`.trim(),
        puesto: employee.nombrePuesto,
        fechaIngreso: employee.fechaIngreso,
        antiguedadAnios: seniorityYears,
      },
      balance: {
        diasTotalesPorDerecho: entitledDays,
        diasTomados: usedDays,
        diasPendientesDeAprobacion: pendingDays,
        diasDisponibles: availableDays,
        puedeSolicitar: availableDays > 0 || !!vacationRules.permitirSaldoNegativo,
      },
      schedule: {
        workingDays,
        restDays,
      },
      constraints: {
        diasAnticipacionMinima: minNoticeDays,
        fechaMinimaPermitida: earliestAllowedDate.toISOString().split('T')[0],
        mesesBloqueados: vacationRules.mesesBloqueados || [],
        diasMinimosPorSolicitud: vacationRules.diasMinimosPorSolicitud || 1,
        permitirSaldoNegativo: !!vacationRules.permitirSaldoNegativo,
      },
    };
  }

  /**
   * Crea y valida formalmente una solicitud de vacaciones
   */
  async createVacationRequest(
    activeUser: ActiveUserDto,
    companyId: number,
    dto: CreateVacationRequestDto,
  ) {
    // 1. Identificar al solicitante activo en la empresa
    const requesterEmployee = await this.prisma.empleados.findFirst({
      where: {
        idUsuario: activeUser.uuid,
        idEmpresa: companyId,
        idTenant: activeUser.idTenant,
        activo: true,
      },
      select: { idEmpleado: true },
    });

    if (!requesterEmployee) {
      throw new NotFoundException(
        'El usuario en sesión no cuenta con un registro de empleado activo en esta empresa.',
      );
    }

    // 2. Obtener balance y restricciones actualizadas del beneficiario
    const balanceData = await this.getEmployeeBalance(activeUser, companyId, dto.idEmpleado);
    const { balance, constraints, employee } = balanceData;

    // 3. Validar consistencia de fechas
    const startDate = new Date(dto.fechaInicio);
    const endDate = new Date(dto.fechaFin);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Formato de fecha inválido.');
    }

    if (endDate <= startDate) {
      throw new BadRequestException(
        'La fecha de reincorporación debe ser posterior a la fecha de inicio de vacaciones.',
      );
    }

    // 4. Validar días de anticipación mínima
    const earliestAllowed = new Date(constraints.fechaMinimaPermitida);
    // Comparación solo fecha (YYYY-MM-DD)
    const startDateOnly = dto.fechaInicio.split('T')[0];
    const earliestAllowedOnly = constraints.fechaMinimaPermitida.split('T')[0];

    if (startDateOnly < earliestAllowedOnly) {
      throw new BadRequestException(
        `La solicitud no cumple con los ${constraints.diasAnticipacionMinima} días de anticipación mínima requeridos. Fecha más próxima: ${earliestAllowedOnly}.`,
      );
    }

    // 5. Validar meses bloqueados
    const blockedMonths = constraints.mesesBloqueados || [];
    if (blockedMonths.length > 0) {
      const current = new Date(startDate);
      while (current < endDate) {
        const month = current.getMonth() + 1; // 1 = Enero, 12 = Diciembre
        if (blockedMonths.includes(month)) {
          throw new BadRequestException(
            `El periodo solicitado comprende meses bloqueados para vacaciones por políticas de la empresa (Mes ${month}).`,
          );
        }
        current.setDate(current.getDate() + 1);
      }
    }

    // 6. Validar días mínimos por solicitud
    if (dto.totalDiasLaborales < (constraints.diasMinimosPorSolicitud || 1)) {
      throw new BadRequestException(
        `El mínimo de días a solicitar permitido por evento es de ${constraints.diasMinimosPorSolicitud} día(s).`,
      );
    }

    // 7. Validar saldo disponible
    if (dto.totalDiasLaborales > balance.diasDisponibles && !constraints.permitirSaldoNegativo) {
      throw new BadRequestException(
        `Días solicitados (${dto.totalDiasLaborales}) exceden el saldo disponible actual (${balance.diasDisponibles} días).`,
      );
    }

    // 8. Obtener el idTipoMovimiento correspondiente a 'VACACIONES'
    const vacationTipoMovimiento = await this.prisma.catTipoMovimiento.findFirst({
      where: {
        codigo: 'VACACIONES',
        activo: true,
      },
    });

    if (!vacationTipoMovimiento) {
      throw new NotFoundException(
        'No se encontró el tipo de movimiento VACACIONES configurado en el sistema.',
      );
    }

    // 9. Guardar la solicitud en transacción
    const newRequest = await this.prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudesIncidencias.create({
        data: {
          idTenant: activeUser.idTenant,
          idEmpresa: companyId,
          idEmpleado: dto.idEmpleado,
          idTipoMovimiento: vacationTipoMovimiento.idTipoMovimiento,
          solicitadoPorIdEmpleado: requesterEmployee.idEmpleado,
          fechaInicio: new Date(`${dto.fechaInicio}T00:00:00.000Z`),
          fechaFin: new Date(`${dto.fechaFin}T00:00:00.000Z`),
          totalDiasLaborales: dto.totalDiasLaborales,
          estatus: SolicitudesIncidencias_estatus.PENDIENTE,
          comentarios: dto.comentarios || null,
        },
      });

      await tx.solicitudesVacacionesDetalle.create({
        data: {
          idSolicitud: solicitud.idSolicitud,
          periodoAnio: Math.max(1, employee.antiguedadAnios),
          diasPrimaVacacional: dto.totalDiasLaborales,
        },
      });

      return solicitud;
    });

    // Aprobar la solicitud automaticamente si no tiene flujo de aprobación
    await this.approvalsService.aprobarAutomaticamenteSinFlujoAprobacion(
      activeUser.idTenant,
      companyId,
      vacationTipoMovimiento.idTipoMovimiento,
      newRequest.idSolicitud,
    );

    return {
      message: 'Solicitud de vacaciones registrada con éxito.',
      data: newRequest,
    };
  }
}