import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmployeeQueryResult, EmployeeDetailResponse, EmployeeSchedule } from './interfaces/employee.interface';
import { SaveSalaryDto } from './dto/save-salary.dto';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class EmployeesService {
  constructor(
    private prisma: PrismaService
  ) { }

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
      jefe.segundoApellido as segundoApellidoJefeDirecto
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
    WHERE ep.idEmpleado = ${employeeId}
      AND ep.idEmpresa = ${companyId}
      AND ep.activo = true;
  `;

    const schedulesPromise = this.prisma.$queryRaw<EmployeeSchedule[]>`
    SELECT 
      idHorario,
      DiaSemana,
      HoraEntrada,
      HoraSalida
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

  async findAllWithCompleteFile(activeUser: ActiveUserDto, companyId: number, page: number, search: string, limit: number) {
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
        ex.fechaActualizacion AS fechaExpedienteCompleto
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

    // 2. Obtener el total de registros que cumplen los filtros
    const totalCountPromise = this.prisma.$queryRaw<{ total: number | bigint }[]>`
      SELECT COUNT(ep.idEmpleado) AS total
      FROM Empleados ep
      LEFT JOIN CatPuestos p ON p.idPuesto = ep.idPuesto
      INNER JOIN Expedientes ex ON ex.idEmpleado = ep.idEmpleado
      WHERE ep.idEmpresa = ${companyId}
        AND ep.activo = 1
        AND ex.idEstatus = 4
        ${searchCondition};
    `;

    // Ejecutamos ambas consultas en paralelo
    const [employees, countResult] = await Promise.all([
      employeesPromise,
      totalCountPromise,
    ]);

    // Si el motor SQL retorna BigInt para COUNT, lo convertimos a Number
    const total = Number(countResult[0]?.total ?? 0);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: employees,
      total,
      currentPage: page,
      totalPages,
    };
  }

}
