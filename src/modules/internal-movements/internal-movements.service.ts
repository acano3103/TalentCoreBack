import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreateInternalMovementDto } from './dto/create-internal-movement.dto';
import { CreateBajaDto } from './dto/baja.dto';

@Injectable()
export class InternalMovementsService {
  constructor(private prisma: PrismaService) {}

  async create(user: ActiveUserDto, companyId: number, employeeId: number, dto: CreateInternalMovementDto) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Lee estado actual
      const empleadoActual = await tx.empleados.findUnique({
        where: { idEmpleado: employeeId },
        include: { CatPuestos: true }
      });
      
      if (!empleadoActual) {
        throw new NotFoundException(`Empleado con id ${employeeId} no encontrado`);
      }

      const idPuestoAnterior = empleadoActual.idPuesto;
      const idAreaAnterior = empleadoActual.CatPuestos?.idArea;
      const idJefeAnterior = empleadoActual.idJefeInmediato;
      const idEmpresaAnterior = empleadoActual.idEmpresa;
      const idSiteAnterior = empleadoActual.idSite;

      // 2. Lee salario actual
      const salarioActual = await tx.historialSalarios.findFirst({
        where: { idEmpleado: employeeId, actual: true }
      });

      // 3. Update en Empleados
      await tx.empleados.update({
        where: { idEmpleado: employeeId },
        data: {
          ...(dto.idPuestoNuevo && { idPuesto: dto.idPuestoNuevo }),
          ...(dto.idJefeNuevo && { idJefeInmediato: dto.idJefeNuevo }),
          ...(dto.idEmpresaNueva && { idEmpresa: dto.idEmpresaNueva }),
          ...(dto.idSiteNuevo && { idSite: dto.idSiteNuevo }),
        }
      });

      // Resolve area nueva if puesto changed
      let idAreaNueva: number | null | undefined = undefined;
      if (dto.idPuestoNuevo) {
        const puestoNuevo = await tx.catPuestos.findUnique({ where: { idPuesto: dto.idPuestoNuevo } });
        idAreaNueva = puestoNuevo?.idArea;
      }

      // 4. Salario
      if (dto.salarioBrutoNuevo && dto.salarioNetoNuevo && dto.idTipoMoneda && dto.idPeriodicidadPago) {
        if (salarioActual) {
          await tx.historialSalarios.update({
            where: { idHistorialSalario: salarioActual.idHistorialSalario },
            data: { actual: false }
          });
        }
        await tx.historialSalarios.create({
          data: {
            idEmpleado: employeeId,
            idTipoMoneda: dto.idTipoMoneda,
            idPeriodicidadPago: dto.idPeriodicidadPago,
            salarioBruto: dto.salarioBrutoNuevo,
            salarioNeto: dto.salarioNetoNuevo,
            fechaInicio: new Date(dto.fechaEfectiva),
            actual: true,
            fechaRegistro: new Date(),
            usuarioRegistro: user.uuid
          }
        });
      }

      // 5. INSERT MovimientosInternos
      const movimiento = await tx.movimientosInternos.create({
        data: {
          idEmpleado: employeeId,
          idEmpresa: companyId,
          tipoMovimiento: dto.tipoMovimiento,
          fechaEfectiva: new Date(dto.fechaEfectiva),
          idPuestoAnterior,
          idPuestoNuevo: dto.idPuestoNuevo,
          idAreaAnterior,
          idAreaNueva,
          idJefeAnterior,
          idJefeNuevo: dto.idJefeNuevo,
          idEmpresaAnterior,
          idEmpresaNueva: dto.idEmpresaNueva,
          idSiteAnterior,
          idSiteNuevo: dto.idSiteNuevo,
          salarioBrutoAnterior: salarioActual?.salarioBruto,
          salarioBrutoNuevo: dto.salarioBrutoNuevo,
          salarioNetoAnterior: salarioActual?.salarioNeto,
          salarioNetoNuevo: dto.salarioNetoNuevo,
          motivo: dto.motivo,
          idUsuarioAutorizo: user.uuid,
        }
      });

      // 6. HistoricoMovimientos
      await tx.historicoMovimientos.create({
        data: {
          idUsuario: user.id,
          idEmpresa: companyId,
          accion: 'MOVIMIENTO_INTERNO',
          tablaOrigen: 'Empleados',
          idRegistro: String(employeeId),
          descripcion: `${user.first_name} ${user.last_name} autorizó un/a ${dto.tipoMovimiento} para el empleado ${employeeId}`,
          fechaCreacion: new Date()
        }
      });

      return movimiento;
    });
  }

  async createBaja(user: ActiveUserDto, companyId: number, employeeId: number, dto: CreateBajaDto) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. UPDATE en Empleados: activo = false.
      await tx.empleados.update({
        where: { idEmpleado: employeeId },
        data: { activo: false }
      });

      // 2. INSERT en MovimientosInternos
      const movimiento = await tx.movimientosInternos.create({
        data: {
          idEmpleado: employeeId,
          idEmpresa: companyId,
          tipoMovimiento: 'BAJA',
          fechaEfectiva: new Date(dto.fechaBaja),
          causaBaja: dto.causaBaja,
          idUsuarioAutorizo: user.uuid,
        }
      });

      // 3. INSERT en HistoricoMovimientos
      await tx.historicoMovimientos.create({
        data: {
          idUsuario: user.id,
          idEmpresa: companyId,
          accion: 'BAJA_EMPLEADO',
          tablaOrigen: 'Empleados',
          idRegistro: String(employeeId),
          descripcion: `${user.first_name} ${user.last_name} autorizó la baja para el empleado ${employeeId}`,
          fechaCreacion: new Date()
        }
      });

      return movimiento;
    });
  }

  async findByEmployee(companyId: number, employeeId: number) {
    return this.prisma.$queryRaw`
      SELECT 
        mi.idMovimiento,
        mi.idEmpleado,
        mi.idEmpresa,
        mi.tipoMovimiento,
        mi.fechaEfectiva,
        mi.idPuestoAnterior,
        mi.idPuestoNuevo,
        mi.idAreaAnterior,
        mi.idAreaNueva,
        mi.idJefeAnterior,
        mi.idJefeNuevo,
        mi.idEmpresaAnterior,
        mi.idEmpresaNueva,
        mi.idSiteAnterior,
        mi.idSiteNuevo,
        mi.salarioBrutoAnterior,
        mi.salarioBrutoNuevo,
        mi.salarioNetoAnterior,
        mi.salarioNetoNuevo,
        mi.motivo,
        mi.causaBaja,
        mi.idUsuarioAutorizo,
        mi.fechaRegistro,
        puestoAnt.NombrePuesto as nombrePuestoAnterior,
        puestoNuevo.NombrePuesto as nombrePuestoNuevo,
        areaAnt.Descripcion as nombreAreaAnterior,
        areaNueva.Descripcion as nombreAreaNueva,
        TRIM(CONCAT_WS(' ', jefeAnt.nombre, jefeAnt.primerApellido, jefeAnt.segundoApellido)) as nombreJefeAnterior,
        TRIM(CONCAT_WS(' ', jefeNuevo.nombre, jefeNuevo.primerApellido, jefeNuevo.segundoApellido)) as nombreJefeNuevo,
        siteAnt.Descripcion as nombreSiteAnterior,
        siteNuevo.Descripcion as nombreSiteNuevo
      FROM MovimientosInternos mi
      LEFT JOIN CatPuestos puestoAnt ON puestoAnt.idPuesto = mi.idPuestoAnterior
      LEFT JOIN CatPuestos puestoNuevo ON puestoNuevo.idPuesto = mi.idPuestoNuevo
      LEFT JOIN CatAreas areaAnt ON areaAnt.idArea = mi.idAreaAnterior
      LEFT JOIN CatAreas areaNueva ON areaNueva.idArea = mi.idAreaNueva
      LEFT JOIN Empleados jefeAnt ON jefeAnt.idEmpleado = mi.idJefeAnterior
      LEFT JOIN Empleados jefeNuevo ON jefeNuevo.idEmpleado = mi.idJefeNuevo
      LEFT JOIN CatSites siteAnt ON siteAnt.idSite = mi.idSiteAnterior
      LEFT JOIN CatSites siteNuevo ON siteNuevo.idSite = mi.idSiteNuevo
      WHERE mi.idEmpleado = ${employeeId} AND mi.idEmpresa = ${companyId}
      ORDER BY mi.fechaEfectiva DESC;
    `;
  }
}
