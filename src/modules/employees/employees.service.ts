import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmployeeQueryResult, EmployeeDetailResponse, EmployeeSchedule } from './interfaces/employee.interface';
import { SaveSalaryDto } from './dto/save-salary.dto';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { Prisma } from 'generated/prisma/client';
import { IntegrationsFactory } from '../integrations/providers/factory.service';
import { UpdateEmployeeScheduleDto } from './dto/update-employee-schedule.dto';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    private prisma: PrismaService,
    private integrationFactory: IntegrationsFactory,
  ) { }

  // Método que obtiene un empleado por su id
  async findOne(companyId: number, employeeId: number): Promise<EmployeeDetailResponse> {
    const employeePromise = this.prisma.$queryRaw<EmployeeQueryResult[]>`
    SELECT 
      ep.idEmpleado,
      ep.nombre,
      ep.primerApellido,
      ep.segundoApellido,
      ep.curp,
      ep.rfc,
      ep.correo,
      ep.telefonoMovil,
      p.idPuesto,
      p.nombrePuesto,
      tp.idTipoPuesto,
      tp.Descripcion as TipoPuesto,
      ns.IdNivelSalario,
      ns.NombreNivel as NivelSalarioNombre,
      ns.Descripcion as NivelSalarioDescripcion, 
      ns.SalarioMinimo as NivelSalarioSalarioMinimo,
      ns.SalarioMaximo as NivelSalarioSalarioMaximo,
      emp.idEmpresa,
      emp.nombre_comercial as Empresa,
      s.idSite,
      s.Descripcion as Ubicacion,
      a.idArea,
      a.Descripcion as Area,
      hs.idHistorialSalario as idSalario,
      hs.salarioBruto,
      hs.salarioNeto,
      hs.bono,
      hs.fechaInicio as fechaInicioSalario,
      tm.idTipoMoneda,
      tm.codigo as TipoMoneda,
      cpp.idPeriodicidadPago,
      cpp.descripcion as PeriodicidadPago,
      jefe.idEmpleado as idJefeDirecto,
      jefe.nombre as nombreJefeDirecto,
      jefe.primerApellido as primerApellidoJefeDirecto,
      jefe.segundoApellido as segundoApellidoJefeDirecto, 
      ep.idModalidad as idModalidadHorario, 
      cm.Descripcion as ModalidadHorario
    FROM Empleados ep
    JOIN CatPuestos p ON ep.idPuesto = p.idPuesto
    JOIN CatTipoPuesto tp ON tp.idTipoPuesto = p.idTipoPuesto
    JOIN CatNivelesSalario ns ON ns.IdNivelSalario = p.IdNivelSalario
    JOIN CatAreas a ON a.idArea = p.idArea
    JOIN CatEmpresas emp ON emp.idEmpresa = ep.idEmpresa
    JOIN CatSites s ON s.idSite = ep.idSite
    LEFT JOIN Empleados jefe ON ep.idJefeInmediato = jefe.idEmpleado
    LEFT JOIN HistorialSalarios hs ON hs.idEmpleado = ep.idEmpleado AND hs.actual = true
    LEFT JOIN CatTiposMoneda tm ON tm.idTipoMoneda = hs.idTipoMoneda
    LEFT JOIN CatPeriodicidadesPago cpp ON cpp.idPeriodicidadPago = hs.idPeriodicidadPago
    LEFT JOIN CatModalidad cm ON cm.idModalidad = ep.idModalidad
    WHERE ep.idEmpleado = ${employeeId}
      AND ep.idEmpresa = ${companyId}
      AND ep.activo = true;
  `;

    const schedulesPromise = this.prisma.$queryRaw<EmployeeSchedule[]>`
    SELECT 
      idHorario,
      DiaSemana,
      HoraEntrada,
      HoraSalida, 
      Modalidad
    FROM HorariosEmpleado
    WHERE idEmpleado = ${employeeId}
    ORDER BY 
      FIELD(DiaSemana, 'Lunes', 'Martes', 'Miércoles', 'Miercoles', 'Jueves', 'Viernes', 'Sábado', 'Sabado', 'Domingo'),
      HoraEntrada ASC;
  `;

    const [[employee], horarios] = await Promise.all([
      employeePromise,
      schedulesPromise,
    ]);

    if (!employee) {
      throw new NotFoundException(`Empleado con id ${employeeId} no encontrado`);
    }

    return {
      ...employee,
      horarios: horarios || [],
    };
  }

  // Método que registra el salario del empleado por primera vez
  async saveSalary(user: ActiveUserDto, companyId: number, employeeId: number, salaryData: SaveSalaryDto) {
    const { idEmpleado, idTipoMoneda, idPeriodicidadPago, salarioBruto, salarioNeto, bono, fechaInicioVigencia } = salaryData;

    await this.prisma.$transaction(async (tx) => {
      // Registramos el salario del empleado en la db
      const newSalary = await tx.historialSalarios.create({
        data: {
          idEmpleado,
          idTipoMoneda,
          idPeriodicidadPago,
          salarioBruto,
          salarioNeto,
          bono: bono ?? 0.00,
          fechaInicio: new Date(fechaInicioVigencia),
          actual: true,
          fechaRegistro: new Date(),
          usuarioRegistro: user.uuid
        }
      })
      // Registramos el movimiento en el historico
      await tx.historicoMovimientos.create({
        data: {
          idUsuario: user.id,
          idEmpresa: companyId,
          accion: 'ACTUALIZAR',
          tablaOrigen: 'Empleados',
          idRegistro: String(idEmpleado),
          descripcion: `${user.first_name} ${user.last_name} creó un nuevo registro salarial para el empleado ${idEmpleado}`,
          fechaCreacion: new Date()
        }
      });
    })

    return { message: 'Salario registrado exitosamente' };
  }

  // Método que obtiene a todos los empleados de la empresa
  async findAll(companyId: number) {
    const employees = await this.prisma.$queryRaw<EmployeeQueryResult[]>`
      SELECT 
        ep.idEmpleado,
        ep.nombre,
        ep.primerApellido,
        ep.segundoApellido,
        ep.curp,
        ep.rfc,
        ep.correo,
        ep.telefonoMovil,
        p.idPuesto,
        p.nombrePuesto,
        tp.idTipoPuesto,
        tp.Descripcion as TipoPuesto,
        ns.IdNivelSalario,
        ns.NombreNivel as NivelSalarioNombre,
        ns.Descripcion as NivelSalarioDescripcion, 
        ns.SalarioMinimo as NivelSalarioSalarioMinimo,
        ns.SalarioMaximo as NivelSalarioSalarioMaximo,
        emp.idEmpresa,
        emp.nombre_comercial as Empresa,
        s.idSite,
        s.Descripcion as Ubicacion,
        a.idArea,
        a.Descripcion as Area,
        hs.idHistorialSalario as idSalario,
        hs.salarioBruto,
        hs.salarioNeto,
        hs.fechaInicio as fechaInicioSalario,
        tm.idTipoMoneda,
        tm.codigo as TipoMoneda,
        cpp.idPeriodicidadPago,
        cpp.descripcion as PeriodicidadPago,
        jefe.idEmpleado as idJefeDirecto,
        jefe.nombre as nombreJefeDirecto,
        jefe.primerApellido as primerApellidoJefeDirecto,
        jefe.segundoApellido as segundoApellidoJefeDirecto
      FROM Empleados ep
      JOIN CatPuestos p ON ep.idPuesto = p.idPuesto
      JOIN CatTipoPuesto tp ON tp.idTipoPuesto = p.idTipoPuesto
      JOIN CatNivelesSalario ns ON ns.IdNivelSalario = p.IdNivelSalario
      JOIN CatAreas a ON a.idArea = p.idArea
      JOIN CatEmpresas emp ON emp.idEmpresa = ep.idEmpresa
      JOIN CatSites s ON s.idSite = ep.idSite
      LEFT JOIN HistorialSalarios hs ON hs.idEmpleado = ep.idEmpleado AND hs.actual = true
      LEFT JOIN CatTiposMoneda tm ON tm.idTipoMoneda = hs.idTipoMoneda
      LEFT JOIN CatPeriodicidadesPago cpp ON cpp.idPeriodicidadPago = hs.idPeriodicidadPago
      LEFT JOIN Empleados jefe ON ep.idJefeInmediato = jefe.idEmpleado
      WHERE ep.idEmpresa = ${companyId}
        AND ep.activo = true;
    `;
    return employees;
  }

  // Obtener a todos los empleados que ya tienen su expediente completo y que no han sido sincronizados con artemis
  async findAllWithCompleteFile(
    activeUser: ActiveUserDto,
    companyId: number,
    page: number,
    search: string,
    limit: number,
  ) {
    const skip = (page - 1) * limit;

    // Condición opcional para búsqueda por nombre, apellidos, correo o puesto
    const searchCondition = search?.trim()
      ? Prisma.sql`AND (
        ep.nombre LIKE ${`%${search}%`} OR
        ep.primerApellido LIKE ${`%${search}%`} OR
        ep.segundoApellido LIKE ${`%${search}%`} OR
        ep.correo LIKE ${`%${search}%`} OR
        p.nombrePuesto LIKE ${`%${search}%`}
      )`
      : Prisma.empty;

    // 1. Obtener registros paginados
    const employeesPromise = this.prisma.$queryRaw`
    SELECT 
      ep.idEmpleado,
      ep.nombre,
      ep.primerApellido,
      ep.segundoApellido,
      ep.correo,
      ep.telefonoMovil,
      p.idPuesto,
      p.nombrePuesto,
      a.idArea,
      a.Descripcion AS area,
      s.idSite,
      s.Descripcion AS site,
      ex.idEstatus,
      ex.fechaActualizacion AS fechaExpedienteCompleto,
      ep.artemisUserId, 
      ep.artemisSyncedAt
    FROM Empleados ep
    LEFT JOIN CatPuestos p ON p.idPuesto = ep.idPuesto
    LEFT JOIN CatAreas a ON a.idArea = p.idArea
    LEFT JOIN CatSites s ON s.idSite = ep.idSite
    INNER JOIN Expedientes ex ON ex.idEmpleado = ep.idEmpleado
    WHERE ep.idEmpresa = ${companyId}
      AND ep.idTenant = ${activeUser.idTenant}
      AND ep.activo = 1
      AND ex.idEstatus = 4
      ${searchCondition}
    ORDER BY ep.nombre ASC
    LIMIT ${limit} OFFSET ${skip};
  `;

    // 2. Obtener el total y los no sincronizados en la misma consulta
    const metricsPromise = this.prisma.$queryRaw<{ total: number | bigint; unassignedSync: number | bigint }[]>`
    SELECT 
      COUNT(ep.idEmpleado) AS total,
      SUM(
        CASE 
          WHEN (ep.artemisUserId IS NULL OR ep.artemisUserId = '') 
            OR ep.artemisSyncedAt IS NULL 
          THEN 1 
          ELSE 0 
        END
      ) AS unassignedSync
    FROM Empleados ep
    LEFT JOIN CatPuestos p ON p.idPuesto = ep.idPuesto
    INNER JOIN Expedientes ex ON ex.idEmpleado = ep.idEmpleado
    WHERE ep.idEmpresa = ${companyId}
      AND ep.idTenant = ${activeUser.idTenant}
      AND ep.activo = 1
      AND ex.idEstatus = 4
      ${searchCondition};
  `;

    // Ejecución paralela
    const [employees, metricsResult] = await Promise.all([
      employeesPromise,
      metricsPromise,
    ]);

    const total = Number(metricsResult[0]?.total ?? 0);
    const pendingSyncCount = Number(metricsResult[0]?.unassignedSync ?? 0);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: employees,
      total,
      currentPage: page,
      totalPages,
      syncStats: {
        pendingSyncCount,
        isFullySynced: total > 0 && pendingSyncCount === 0,
      },
    };
  }

  // Método que sincroniza todos los empleados pendientes de la empresa con artemis
  async syncAllPendingToArtemis(activeUser: ActiveUserDto, companyId: number) {
    // Buscar empleados con expediente completo (idEstatus = 4) y sin sincronizar
    const pendingEmployees = await this.prisma.empleados.findMany({
      where: {
        idEmpresa: companyId,
        idTenant: activeUser.idTenant,
        activo: true,
        Expedientes: { some: { idEstatus: 4 } },
        OR: [
          { artemisUserId: null },
          { artemisUserId: '' },
          { artemisSyncedAt: null },
        ],
      },
    });

    if (pendingEmployees.length === 0) {
      return { message: 'No hay empleados pendientes de sincronizar.', synced: 0 };
    }

    // Buscamos si la empresa tiene una integración de Artemis activa
    const activeArtemisIntegration = await this.prisma.integraciones.findFirst({
      where: {
        idEmpresa: companyId,
        isConnected: true,
        CatIntegracionesProvedores: {
          name: 'Artemis',
          type: 'workforce',
          isActive: true
        }
      },
      include: {
        CatIntegracionesProvedores: true
      }
    });

    // Si la empresa no tiene la Artemis configurada, forzamos un error
    if (!activeArtemisIntegration) {
      throw new BadRequestException('La empresa no cuenta con una integración de Artemis activa.');
    }

    const providerId = activeArtemisIntegration.providerId;
    const artemisProvider = await this.integrationFactory.getProvider(providerId);

    await Promise.all(
      pendingEmployees.map(async (employee) => {

        const { schedules, bankDetails, salaryInfo, address } = await this.prisma.$transaction(async (tx) => {
          const [schedules, bankDetails, salaryInfo, address] = await Promise.all([
            tx.horariosEmpleado.findMany({ where: { idEmpleado: employee.idEmpleado } }),
            tx.datosBancarios.findFirst({ where: { idEmpleado: employee.idEmpleado } }),
            tx.historialSalarios.findFirst({ where: { idEmpleado: employee.idEmpleado, actual: true } }),
            tx.domicilioEmpleado.findFirst({ where: { idEmpleado: employee.idEmpleado } }),
          ]);

          return { schedules, bankDetails, salaryInfo, address };
        });

        const employeeData = {
          externalEmployeeId: employee.numeroEmpleado,
          name: employee.nombre,
          lastName: employee.primerApellido,
          motherLastName: employee.segundoApellido,
          email: employee.correo,
          phone: employee.telefonoMovil,
          rfc: employee.rfc,
          curp: employee.curp,
          nss: employee.numeroSeguroSocial,
          startDate: employee.FechaRegistro,
          birthDate: employee.fechaNacimiento,
          schedules: schedules,
          bankDetails: bankDetails,
          salaryInfo: salaryInfo,
          address: address
        };

        const response = await artemisProvider.syncSingleEmployee(companyId, employeeData);
        console.log('Respuesta recibida de Artemis:', response);

        // GUARDAR EN LA BD TALENTCORE
        await this.prisma.empleados.update({
          where: { idEmpleado: employee.idEmpleado },
          data: {
            artemisUserId: response.artemisUserId,
            artemisSyncedAt: new Date(),
          },
        });

        return response;
      }),
    );

    return { message: 'Empleados sincronizados exitosamente.', synced: pendingEmployees.length };
  }

  async updateSchedule(activeUser: ActiveUserDto, companyId: number, employeeId: number, dto: UpdateEmployeeScheduleDto,) {
    // Validar existencia del empleado dentro de la empresa
    const employee = await this.prisma.empleados.findFirst({
      where: {
        idEmpleado: employeeId,
        idEmpresa: companyId,
        idTenant: activeUser.idTenant,
      },
    });

    if (!employee) {
      throw new NotFoundException(`Empleado con ID ${employeeId} no fue encontrado en esta empresa`);
    }

    return await this.prisma.$transaction(async (tx) => {
      let idModalidad = dto.idModalidadHorario;
      if (!idModalidad) {
        const modalidadRecord = await tx.catModalidad.findFirst({
          where: {
            Descripcion: {
              equals: dto.ModalidadHorario.trim(),
            },
          },
        });
        if (modalidadRecord) {
          idModalidad = modalidadRecord.idModalidad;
        }
      }

      await tx.empleados.update({
        where: { idEmpleado: employeeId },
        data: {
          ...(idModalidad ? { idModalidad: idModalidad } : {}),
        },
      });

      // Eliminamos los horarios anteriores del empleado y creamos la lista actualizada
      await tx.horariosEmpleado.deleteMany({
        where: { idEmpleado: employeeId },
      });

      if (dto.horarios && dto.horarios.length > 0) {
        await tx.horariosEmpleado.createMany({
          data: dto.horarios.map((h) => ({
            idEmpleado: employeeId,
            DiaSemana: h.DiaSemana,
            HoraEntrada: new Date(h.HoraEntrada),
            HoraSalida: new Date(h.HoraSalida),
            Modalidad: h.Modalidad,
          })),
        })
      }

      // Registramos el movimiento en el historico
      await tx.historicoMovimientos.create({
        data: {
          idUsuario: activeUser.id,
          idEmpresa: companyId,
          accion: 'ACTUALIZAR',
          tablaOrigen: 'Empleados',
          idRegistro: String(employeeId),
          descripcion: `El usuario ${activeUser.username} actualizó el horario laboral del empleado ${employee.numeroEmpleado}`,
          fechaCreacion: new Date()
        }
      });

      return {
        message: 'Horario laboral y modalidad actualizados correctamente',
        idEmpleado: employeeId,
      };
    });
  }
}
