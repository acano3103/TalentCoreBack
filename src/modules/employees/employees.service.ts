import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmployeeQueryResult } from './interfaces/employee.interface';

@Injectable()
export class EmployeesService {
  constructor(
    private prisma: PrismaService
  ) { }

  create(createEmployeeDto: CreateEmployeeDto) {
    return 'This action adds a new employee';
  }

  findAll() {
    return `This action returns all employees`;
  }

  async findOne(companyId: number, employeeId: number) {
    const [employee] = await this.prisma.$queryRaw<EmployeeQueryResult[]>`
      SELECT 
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
        cpp.descripcion as PeriodicidadPago
      FROM Empleados ep
      JOIN CatPuestos p ON ep.idPuesto = p.idPuesto
      JOIN CatTipoPuesto tp ON tp.idTipoPuesto = p.idTipoPuesto
      JOIN CatNivelesSalario ns ON ns.IdNivelSalario = p.IdNivelSalario
      JOIN CatAreas a ON a.idArea = p.idArea
      JOIN CatEmpresas emp ON emp.idEmpresa = ep.idEmpresa
      JOIN CatSites s ON s.idSite = ep.idSite
      LEFT JOIN HistorialSalarios hs ON hs.idEmpleado = ep.idEmpleado
      LEFT JOIN CatTiposMoneda tm ON tm.idTipoMoneda = hs.idTipoMoneda
      LEFT JOIN CatPeriodicidadesPago cpp ON cpp.idPeriodicidadPago = hs.idPeriodicidadPago
      WHERE ep.idEmpleado = ${employeeId}
        AND ep.activo = true;
    `

    if (employee) return employee;
    throw new NotFoundException(`Empleado con id ${employeeId} no encontrado`);
  }

  update(employeeId: number, updateEmployeeDto: UpdateEmployeeDto) {
    return `This action updates a #${employeeId} employee`;
  }

  remove(id: number) {
    return `This action removes a #${id} employee`;
  }
}
