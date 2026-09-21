import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmployeeQueryResult, EmployeeDetailResponse, EmployeeSchedule } from './interfaces/employee.interface';
import { SaveSalaryDto } from './dto/save-salary.dto';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { Prisma } from 'generated/prisma/client';
import { IntegrationsFactory } from '../integrations/providers/factory.service';
import { UpdateEmployeeScheduleDto } from './dto/update-employee-schedule.dto';
import { UpdateAttendanceConfigDto } from './dto/update-attendance-config.dto';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    private prisma: PrismaService,
    private integrationFactory: IntegrationsFactory,
  ) { }

  // Método que obtiene un empleado por su id con horarios, sedes autorizadas y DIDs
  async findOne(companyId: number, employeeId: number): Promise<EmployeeDetailResponse> {
    const employeePromise = this.prisma.$queryRaw<EmployeeQueryResult[]>`
    SELECT 
      ep.idEmpleado,
      ep.numeroEmpleado,
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
      s.TipoAsistencia as tipoAsistenciaUbicacionPrincipal,
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
      cm.Descripcion as ModalidadHorario,
      CAST(
        EXISTS(
          SELECT 1 FROM auth_user u 
          WHERE u.uuid = ep.idUsuario 
            AND u.is_active = 1
        ) AS UNSIGNED
      ) AS tieneUsuarioActivo
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

    // Sedes autorizadas para este empleado (RelEmpleadosSites)
    const allowedSitesPromise = this.prisma.$queryRaw<any[]>`
    SELECT 
      res.idEmpleadoSite,
      s.idSite,
      s.Descripcion as nombreUbicacion,
      s.TipoAsistencia as tipoAsistenciaSede,
      COALESCE(res.MetodoAsistencia, s.TipoAsistencia) as metodoAsistenciaAsignado,
      res.EsPrincipal,
      res.Activo
    FROM RelEmpleadosSites res
    JOIN CatSites s ON s.idSite = res.idSite
    WHERE res.idEmpleado = ${employeeId}
      AND res.idEmpresa = ${companyId}
      AND res.Activo = 1;
  `;

    // DIDs autorizados (Catálogo de sedes con IVR + Excepciones BLOQUEADO / EXTRA)
    const didsPromise = this.prisma.$queryRaw<any[]>`
    SELECT 
      d.Did,
      d.idSite,
      d.nombreUbicacion,
      d.origen,
      d.motivo,
      CAST(
        CASE 
          WHEN d.origen = 'EXTRA' THEN 1
          WHEN exc.idExcepcion IS NOT NULL THEN 0 
          ELSE 1 
        END AS UNSIGNED
      ) as habilitado
    FROM (
      -- 1. DIDs de las sedes con IVR asignadas al colaborador
      SELECT 
        sd.Did,
        s.idSite,
        s.Descripcion as nombreUbicacion,
        'UBICACION' as origen,
        NULL as motivo
      FROM RelEmpleadosSites res
      JOIN CatSites s ON s.idSite = res.idSite
      JOIN CatSitesDids sd ON sd.idSite = s.idSite AND sd.Activo = 1
      WHERE res.idEmpleado = ${employeeId} 
        AND res.idEmpresa = ${companyId}
        AND res.Activo = 1
        AND (res.MetodoAsistencia = 'IVR' OR (res.MetodoAsistencia IS NULL AND s.TipoAsistencia = 'IVR'))

      UNION ALL

      -- 2. DIDs personalizados EXTRA asignados al colaborador
      SELECT 
        e_extra.Did,
        NULL as idSite,
        'Número Personalizado' as nombreUbicacion,
        'EXTRA' as origen,
        e_extra.Motivo as motivo
      FROM RelEmpleadosDidsExcepciones e_extra
      WHERE e_extra.idEmpleado = ${employeeId}
        AND e_extra.idEmpresa = ${companyId}
        AND e_extra.TipoExcepcion = 'EXTRA'
        AND e_extra.Activo = 1
    ) d
    LEFT JOIN RelEmpleadosDidsExcepciones exc 
      ON exc.idEmpleado = ${employeeId} 
     AND exc.idEmpresa = ${companyId}
     AND exc.Did = d.Did 
     AND exc.TipoExcepcion = 'BLOQUEADO'
     AND exc.Activo = 1
    ORDER BY d.nombreUbicacion ASC, d.Did ASC;
  `;

    const [[rawEmployee], schedules, rawSites, rawDids] = await Promise.all([
      employeePromise,
      schedulesPromise,
      allowedSitesPromise,
      didsPromise,
    ]);

    if (!rawEmployee) {
      throw new NotFoundException(`Empleado con id ${employeeId} no encontrado`);
    }

    // Conversión recursiva de BigInt a Number manteniendo arreglos nativos
    const sanitizeBigInt = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'bigint') return Number(obj);

      if (Array.isArray(obj)) {
        return obj.map(item => sanitizeBigInt(item));
      }

      if (obj instanceof Date) return obj;

      // Detecta objetos Decimal de Prisma/decimal.js (tienen método toNumber)
      if (typeof obj === 'object' && typeof obj.toNumber === 'function') {
        return obj.toNumber();
      }

      if (typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = sanitizeBigInt(value);
        }
        return result;
      }

      return obj;
    };

    const employee = sanitizeBigInt(rawEmployee);
    const horarios = sanitizeBigInt(schedules || []);
    const sedesAsignadas = sanitizeBigInt(rawSites || []);
    const didsAutorizados = sanitizeBigInt(rawDids || []);

    const tieneSedesConfiguradas = sedesAsignadas.length > 0;

    return {
      ...employee,
      tieneUsuarioActivo: Boolean(employee.tieneUsuarioActivo),
      horarios,
      asistencia: {
        activa: tieneSedesConfiguradas,
        ubicacionPrincipal: {
          idSite: employee.idSite,
          nombre: employee.Ubicacion,
          tipoAsistencia: employee.tipoAsistenciaUbicacionPrincipal || null,
        },
        sedesAutorizadas: sedesAsignadas,
        didsAutorizados,
      },
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
    withoutManager: boolean = false,
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

    // Condición opcional para empleados sin jefe inmediato asignado
    const withoutManagerCondition = withoutManager
      ? Prisma.sql`AND (ep.idJefeInmediato IS NULL OR ep.idJefeInmediato = 0)`
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
        ep.artemisSyncedAt, 
        ep.idJefeInmediato
      FROM Empleados ep
      LEFT JOIN CatPuestos p ON p.idPuesto = ep.idPuesto
      LEFT JOIN CatAreas a ON a.idArea = p.idArea
      LEFT JOIN CatSites s ON s.idSite = ep.idSite
      INNER JOIN Expedientes ex ON ex.idEmpleado = ep.idEmpleado
      WHERE ep.idEmpresa = ${companyId}
        AND ep.idTenant = ${activeUser.idTenant}
        AND ep.activo = 1
        -- AND ex.idEstatus = 4
        ${searchCondition}
        ${withoutManagerCondition}
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
        -- AND ex.idEstatus = 4
        ${searchCondition}
        ${withoutManagerCondition};
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

  // Endpoint para obtener las sedes con asistencia configurada
  async getLocationsForAttendance(companyId: number, user: ActiveUserDto) {
    return this.prisma.catSites.findMany({
      where: {
        idEmpresa: companyId,
        idTenant: user.idTenant,
        Activo: true,
        TipoAsistencia: { not: null }, // Solo sedes con asistencia configurada
      },
      select: {
        idSite: true,
        Descripcion: true,
        TipoAsistencia: true,
        EsPrincipal: true,
        CatSitesDids: {
          where: { Activo: true },
          select: { idSiteDid: true, Did: true, Descripcion: true },
        },
      },
      orderBy: { Descripcion: 'asc' },
    });
  }

  // Actualización de configuración de sedes y excepciones de DIDs
  async updateAttendanceConfig(
    user: ActiveUserDto,
    companyId: number,
    employeeId: number,
    dto: UpdateAttendanceConfigDto,
  ) {
    if (!user.idTenant) {
      throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');
    }

    const employeeExists = await this.prisma.empleados.findFirst({
      where: {
        idEmpleado: employeeId,
        idEmpresa: companyId,
        idTenant: user.idTenant,
      },
    });
    if (!employeeExists) {
      throw new NotFoundException('El empleado especificado no existe para esta empresa.');
    }

    const sedes = dto.sedes || [];
    const excepcionesDids = dto.excepcionesDids || [];
    const selectedSiteIds = sedes.map((s) => s.idSite);

    return this.prisma.$transaction(async (tx: any) => {
      const relSitesModel = tx.relEmpleadosSites || tx.RelEmpleadosSites;
      const relExcepcionesModel = tx.relEmpleadosDidsExcepciones || tx.RelEmpleadosDidsExcepciones;

      // 1. Eliminar sedes que fueron desmarcadas
      await relSitesModel.deleteMany({
        where: {
          idEmpleado: employeeId,
          idEmpresa: companyId,
          idSite: { notIn: selectedSiteIds },
        },
      });

      // 2. Insertar o actualizar sedes seleccionadas
      for (const sede of sedes) {
        const existing = await relSitesModel.findFirst({
          where: {
            idEmpleado: employeeId,
            idSite: sede.idSite,
          },
        });

        if (existing) {
          await relSitesModel.update({
            where: { idEmpleadoSite: existing.idEmpleadoSite },
            data: {
              MetodoAsistencia: sede.metodoAsistencia || null,
              Activo: true,
            },
          });
        } else {
          await relSitesModel.create({
            data: {
              idTenant: user.idTenant,
              idEmpresa: companyId,
              idEmpleado: employeeId,
              idSite: sede.idSite,
              MetodoAsistencia: sede.metodoAsistencia || null,
              Activo: true,
              FechaAsignacion: new Date(),
            },
          });
        }
      }

      // 3. Sincronizar excepciones de DIDs (recreación limpia)
      await relExcepcionesModel.deleteMany({
        where: {
          idEmpleado: employeeId,
          idEmpresa: companyId,
        },
      });

      if (excepcionesDids.length > 0) {
        await relExcepcionesModel.createMany({
          data: excepcionesDids.map((exc) => ({
            idTenant: user.idTenant,
            idEmpresa: companyId,
            idEmpleado: employeeId,
            Did: exc.did.trim(),
            TipoExcepcion: exc.tipoExcepcion, // 'BLOQUEADO' | 'EXTRA'
            Activo: true, // La regla de excepción se guarda activa
            FechaRegistro: new Date(),
          })),
        });
      }

      return {
        success: true,
        message: 'Configuración de asistencia actualizada correctamente',
      };
    });
  }

  // Obtiene la lista de colaboradores disponibles para ser jefe inmediato según el puesto.
  async getImmediateBossOptions(
    companyId: number,
    positionId: number,
    user: ActiveUserDto,
  ) {
    if (!user.idTenant) throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');

    // Buscamos el puesto para conocer el ID del puesto superior / jefe configurado
    const puesto = await this.prisma.catPuestos.findFirst({
      where: {
        idPuesto: positionId,
        idEmpresa: companyId,
        idTenant: user.idTenant,
      },
      select: {
        idPuesto: true,
        NombrePuesto: true,
        idJefeInmediato: true,
      },
    });

    if (!puesto) throw new NotFoundException('El puesto indicado no existe.');

    // Si el puesto no tiene configurado un puesto jefe superior (es puesto raíz)
    if (!puesto.idJefeInmediato || puesto.idJefeInmediato === 0) return [];

    // Buscamos a los empleados activos que ocupan ese puesto superior
    const bossEmployees = await this.prisma.empleados.findMany({
      where: {
        idEmpresa: companyId,
        idTenant: user.idTenant,
        idPuesto: puesto.idJefeInmediato,
        activo: true,
      },
      select: {
        idEmpleado: true,
        nombre: true,
        primerApellido: true,
        segundoApellido: true,
      },
      orderBy: {
        nombre: 'asc',
      },
    });

    const imediatePosition = await this.prisma.catPuestos.findFirst({
      where: {
        idTenant: user.idTenant,
        idEmpresa: companyId,
        idPuesto: puesto.idJefeInmediato,
      },
      select: {
        NombrePuesto: true,
      },
    });

    return bossEmployees.map((b) => ({
      idEmpleado: b.idEmpleado,
      nombreCompleto: [b.nombre, b.primerApellido, b.segundoApellido].filter(Boolean).join(' '),
      puesto: imediatePosition?.NombrePuesto || 'Puesto no asignado',
    }));
  }

  // Actualiza el idJefeInmediato del empleado.
  async updateEmployeeImmediateBoss(
    companyId: number,
    employeeId: number,
    immediateBossId: number,
    user: ActiveUserDto,
  ) {
    if (!user.idTenant) throw new InternalServerErrorException('El usuario no tiene un tenant asignado.');

    // Validar que el empleado no sea su propio jefe
    if (employeeId === immediateBossId) {
      throw new BadRequestException('Un empleado no puede asignarse a sí mismo como su propio jefe inmediato.');
    }

    // Validar que el empleado objetivo exista en la empresa y tenant
    const employee = await this.prisma.empleados.findFirst({
      where: {
        idEmpleado: employeeId,
        idEmpresa: companyId,
        idTenant: user.idTenant,
        activo: true,
      },
      select: { idEmpleado: true, nombre: true, primerApellido: true },
    });

    if (!employee) throw new NotFoundException('Empleado no encontrado.');

    // Validar que el jefe inmediato seleccionado exista y esté activo en la misma empresa
    const boss = await this.prisma.empleados.findFirst({
      where: {
        idEmpleado: immediateBossId,
        idEmpresa: companyId,
        idTenant: user.idTenant,
        activo: true,
      },
      select: { idEmpleado: true, nombre: true, primerApellido: true },
    });

    if (!boss) {
      throw new NotFoundException('El colaborador seleccionado como jefe inmediato no existe o no está activo.');
    }

    // 4. Actualizar el registro del empleado
    await this.prisma.$executeRaw`
      UPDATE Empleados
      SET idJefeInmediato = ${immediateBossId}
      WHERE idEmpleado = ${employeeId}
        AND idEmpresa = ${companyId}
        AND idTenant = ${user.idTenant};
    `;

    return {
      success: true,
      message: `Jefe inmediato asignado correctamente a ${employee.nombre} ${employee.primerApellido}.`,
    };
  }
}
