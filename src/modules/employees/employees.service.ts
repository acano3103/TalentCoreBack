import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmployeeQueryResult } from './interfaces/employee.interface';
import { SaveSalaryDto } from './dto/save-salary.dto';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@Injectable()
export class EmployeesService {
  constructor(
    private prisma: PrismaService
  ) { }

  async findOne(companyId: number, employeeId: number) {
    const [employee] = await this.prisma.$queryRaw<EmployeeQueryResult[]>`
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
      LEFT JOIN Empleados jefe ON ep.idJefeInmediato = jefe.idEmpleado
      LEFT JOIN HistorialSalarios hs ON hs.idEmpleado = ep.idEmpleado AND hs.actual = true
      LEFT JOIN CatTiposMoneda tm ON tm.idTipoMoneda = hs.idTipoMoneda
      LEFT JOIN CatPeriodicidadesPago cpp ON cpp.idPeriodicidadPago = hs.idPeriodicidadPago
      WHERE ep.idEmpleado = ${employeeId}
        AND ep.activo = true;
    `

    if (employee) return employee;
    throw new NotFoundException(`Empleado con id ${employeeId} no encontrado`);
  }

  async saveSalary(user: ActiveUserDto, companyId: number, employeeId: number, salaryData: SaveSalaryDto) {

    const { idEmpleado, idTipoMoneda, idPeriodicidadPago, salarioBruto, salarioNeto, fechaInicioVigencia } = salaryData;

    await this.prisma.$transaction(async (tx) => {
      // Registramos el salario del empleado en la db
      const newSalary = await tx.historialSalarios.create({
        data: {
          idEmpleado,
          idTipoMoneda,
          idPeriodicidadPago,
          salarioBruto,
          salarioNeto,
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

}
