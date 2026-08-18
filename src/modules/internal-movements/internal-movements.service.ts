import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreateInternalMovementDto } from './dto/create-internal-movement.dto';
import { CreateBajaDto } from './dto/baja.dto';
import { NotificationDispatcher } from '../notifications/notification.dispatcher';

@Injectable()
export class InternalMovementsService {
  constructor(
    private prisma: PrismaService,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async create(user: ActiveUserDto, companyId: number, employeeId: number, dto: CreateInternalMovementDto) {
    // Decisión dinámica: si el tipo de movimiento tiene pasos de aprobación configurados,
    // pasa por el flujo de solicitud/aprobación. De lo contrario, se aplica directamente.
    const tipoMov = await this.prisma.catTipoMovimiento.findUnique({
      where: { codigo: dto.tipoMovimiento }
    });

    const tieneConfiguracion = tipoMov
      ? (await this.prisma.configuracionPasosAprobacion.count({
          where: { idTipoMovimiento: tipoMov.idTipoMovimiento, activo: true }
        })) > 0
      : false;

    if (tieneConfiguracion) {
      return this.createMovementRequest(user, companyId, employeeId, dto);
    }


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
            fechaInicio: dto.fechaEfectiva ? new Date(dto.fechaEfectiva) : new Date(),
            actual: true,
            fechaRegistro: new Date(),
            usuarioRegistro: user.uuid
          }
        });
      }

      // 5. INSERT MovimientosInternos (aprobación directa para otros tipos de movimiento)
      const movimiento = await tx.movimientosInternos.create({
        data: {
          idEmpleado: employeeId,
          idEmpresa: companyId,
          tipoMovimiento: dto.tipoMovimiento,
          fechaEfectiva: dto.fechaEfectiva ? new Date(dto.fechaEfectiva) : new Date(),
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
          idEstatusMovimiento: 6, // APROBADO directo
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

  async createMovementRequest(user: ActiveUserDto, companyId: number, employeeId: number, dto: CreateInternalMovementDto) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Lee estado actual
      const empleadoActual = await tx.empleados.findUnique({
        where: { idEmpleado: employeeId },
        include: { CatPuestos: true }
      });

      if (!empleadoActual) {
        throw new NotFoundException(`Empleado con id ${employeeId} no encontrado`);
      }

      // 2. Cargar configuración dinámica de pasos de aprobación
      const tipoMov = await tx.catTipoMovimiento.findUnique({
        where: { codigo: dto.tipoMovimiento }
      });

      if (!tipoMov) {
        throw new NotFoundException(`Tipo de movimiento no configurado para aprobación: ${dto.tipoMovimiento}`);
      }

      const configuracionPasos = await tx.configuracionPasosAprobacion.findMany({
        where: { idTipoMovimiento: tipoMov.idTipoMovimiento, activo: true },
        orderBy: { paso: 'asc' }
      });

      if (configuracionPasos.length === 0) {
        throw new NotFoundException(`No hay pasos de aprobación activos para ${dto.tipoMovimiento}`);
      }

      const idPuestoAnterior = empleadoActual.idPuesto;
      const idAreaAnterior = empleadoActual.CatPuestos?.idArea;
      const idJefeAnterior = empleadoActual.idJefeInmediato;
      const idEmpresaAnterior = empleadoActual.idEmpresa;
      const idSiteAnterior = empleadoActual.idSite;

      // 3. Lee salario actual
      const salarioActual = await tx.historialSalarios.findFirst({
        where: { idEmpleado: employeeId, actual: true }
      });

      // Resolve area nueva si cambió el puesto
      let idAreaNueva: number | null | undefined = undefined;
      if (dto.idPuestoNuevo) {
        const puestoNuevo = await tx.catPuestos.findUnique({ where: { idPuesto: dto.idPuestoNuevo } });
        idAreaNueva = puestoNuevo?.idArea;
      }

      // 4. INSERT en MovimientosInternos con estatus 1 (PENDIENTE global),
      //    creando en cascada los pasos de aprobación individuales
      const movimiento = await tx.movimientosInternos.create({
        data: {
          idEmpleado: employeeId,
          idEmpresa: companyId,
          tipoMovimiento: dto.tipoMovimiento,
          fechaEfectiva: dto.fechaEfectiva ? new Date(dto.fechaEfectiva) : null,
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
          idEstatusMovimiento: 1, // 1 = PENDIENTE global
          idUsuarioAutorizo: null,
          PasosAprobacionMovimiento: {
            create: configuracionPasos.map(c => ({
              idRolAprobador: c.idRolAprobador,
              paso: c.paso,
              idEstatus: 1, // 1 = Pendiente por cada paso
            }))
          }
        }
      });

      // 5. INSERT en HistoricoMovimientos
      await tx.historicoMovimientos.create({
        data: {
          idUsuario: user.id,
          idEmpresa: companyId,
          accion: 'SOLICITUD_MOVIMIENTO',
          tablaOrigen: 'Empleados',
          idRegistro: String(employeeId),
          descripcion: `${user.first_name} ${user.last_name} solicitó un(a) ${dto.tipoMovimiento} para el empleado ${employeeId}`,
          fechaCreacion: new Date()
        }
      });

      // 6. Notificación al primer aprobador (Jefe Inmediato para paso 1)
      try {
        const bossResult = await tx.$queryRaw<Array<{ uuid: string; email: string; phone: string; first_name: string; last_name: string }>>`
          SELECT u.uuid, u.email, u.phone, u.first_name, u.last_name
          FROM Empleados ep
          JOIN Empleados jefe ON ep.idJefeInmediato = jefe.idEmpleado
          JOIN auth_user u ON jefe.idUsuario = u.uuid
          WHERE ep.idEmpleado = ${employeeId}
            AND ep.idEmpresa = ${companyId}
            AND jefe.activo = 1
            AND u.is_active = 1
        `;

        if (bossResult && bossResult.length > 0) {
          const boss = bossResult[0];
          await this.notifications.notify({
            userUuid: boss.uuid,
            notificationTypeCode: 'MOVEMENT_REQUEST_CREATED',
            to: boss.email,
            phone: boss.phone,
            subject: `Nueva solicitud de ${dto.tipoMovimiento} para colaborador`,
            context: {
              name: `${boss.first_name} ${boss.last_name}`,
              requestingUser: `${user.first_name} ${user.last_name}`,
              employeeId: employeeId,
              date: new Date()
            }
          });
        }
      } catch (err) {
        // Ignorar fallos de notificación para no revertir la transacción
      }

      return movimiento;
    });
  }

  async findMovementById(companyId: number, movementId: number, activeUser: ActiveUserDto) {
    // Incluimos los pasos de aprobación y sus roles para tomar decisiones dinámicas
    const movement = await this.prisma.movimientosInternos.findFirst({
      where: {
        idMovimiento: movementId,
        idEmpresa: companyId
      },
      include: {
        PasosAprobacionMovimiento: {
          include: { CatRolAprobador: true },
          orderBy: { paso: 'asc' }
        }
      }
    });

    if (!movement) {
      throw new NotFoundException(`El movimiento interno ${movementId} no existe o no pertenece a tu empresa`);
    }

    const userRoles = await this.prisma.relUsuarioRol.findMany({
      where: { idUsuario: activeUser.id, activo: true }
    });

    const roleIds = userRoles.map(r => r.idRol);

    // Constantes nombradas para los IDs de CatRoles en BD
    // Confirmados: 1=Admin, 2=RH, 3=Finanzas, 4=Reclutador, 5=Manager, 6=Empleado
    const ROLE_ADMIN = 1;
    const ROLE_RH = 2;
    const ROLE_FINANZAS = 3;
    const ROLE_MANAGER = 5;
    // PENDIENTE PM: CatRoles aún no tiene un idRol para DIRECTOR_AREA, DIRECCION_GENERAL ni LEGAL.
    // Hasta que el negocio defina sus IDs en CatRoles, solo Admin (ROLE_ADMIN = 1) puede dictaminar esos pasos.

    let canApproveOrReject = false;
    let userContextRole = 'VIEWER';

    // Solo se puede dictaminar si el movimiento está globalmente PENDIENTE (estatus 1)
    if (movement.idEstatusMovimiento === 1) {
      // Encontrar el primer paso que sigue pendiente (idEstatus = 1)
      const activeStep = movement.PasosAprobacionMovimiento.find(p => p.idEstatus === 1);

      if (activeStep) {
        const roleCode = activeStep.CatRolAprobador.codigo;
        userContextRole = roleCode;

        if (roleCode === 'JEFE_INMEDIATO') {
          // El jefe directo se identifica por jerarquía en BD. Admin y Manager pueden actuar como sustitutos.
          const bossResult = await this.prisma.$queryRaw<any[]>`
            SELECT u.uuid
            FROM Empleados emp
            JOIN Empleados jefe ON emp.idJefeInmediato = jefe.idEmpleado
            JOIN auth_user u ON jefe.idUsuario = u.uuid
            WHERE emp.idEmpleado = ${movement.idEmpleado}
              AND emp.idEmpresa = ${companyId}
              AND jefe.activo = 1
              AND u.is_active = 1
          `;
          if (
            (bossResult && bossResult.length > 0 && bossResult[0].uuid === activeUser.uuid) ||
            roleIds.includes(ROLE_ADMIN) || roleIds.includes(ROLE_MANAGER)
          ) {
            canApproveOrReject = true;
          }
        } else if (roleCode === 'NUEVO_JEFE') {
          // El nuevo jefe destino se identifica por idJefeNuevo del movimiento. Admin y Manager pueden actuar como sustitutos.
          if (movement.idJefeNuevo) {
            const newBossResult = await this.prisma.$queryRaw<any[]>`
              SELECT u.uuid
              FROM Empleados jefe
              JOIN auth_user u ON jefe.idUsuario = u.uuid
              WHERE jefe.idEmpleado = ${movement.idJefeNuevo}
                AND jefe.activo = 1
                AND u.is_active = 1
            `;
            if (
              (newBossResult && newBossResult.length > 0 && newBossResult[0].uuid === activeUser.uuid) ||
              roleIds.includes(ROLE_ADMIN) || roleIds.includes(ROLE_MANAGER)
            ) {
              canApproveOrReject = true;
            }
          } else if (roleIds.includes(ROLE_ADMIN) || roleIds.includes(ROLE_MANAGER)) {
            // Si no hay idJefeNuevo definido en el movimiento, solo admins/managers pueden aprobar
            canApproveOrReject = true;
          }
        } else {
          // Para todos los demás roles de aprobación (RECURSOS_HUMANOS, FINANZAS, DIRECTOR_AREA, DIRECCION_GENERAL, LEGAL, etc.):
          // 1. Admin (ROLE_ADMIN = 1) puede sustituir en cualquier paso
          if (roleIds.includes(ROLE_ADMIN)) {
            canApproveOrReject = true;
          } else {
            // 2. Consultar AsignacionAprobador por idRolAprobador (y coincidencia de área si el rol lo requiere)
            const movementAreaId = movement.idAreaNueva ?? movement.idAreaAnterior ?? null;
            const assignments = await this.prisma.asignacionAprobador.findMany({
              where: {
                idRolAprobador: activeStep.idRolAprobador,
                activo: true,
                OR: [
                  { idArea: null },
                  ...(movementAreaId ? [{ idArea: movementAreaId }] : [])
                ]
              }
            });

            if (assignments.some(a => a.idUsuario === activeUser.id)) {
              canApproveOrReject = true;
            }
          }
        }
      }
    }

    return {
      movement,
      permissions: {
        canApproveOrReject,
        userContextRole
      }
    };
  }

  async evaluateMovement(companyId: number, movementId: number, action: 'aprobar' | 'rechazar', activeUser: ActiveUserDto) {
    const { movement, permissions } = await this.findMovementById(companyId, movementId, activeUser);

    if (!permissions.canApproveOrReject) {
      throw new ForbiddenException('No tienes privilegios para dictaminar este movimiento en su estatus actual.');
    }

    if (action === 'rechazar') {
      return await this.prisma.$transaction(async (tx) => {
        // Marcar el paso activo como rechazado
        const activeStep = movement.PasosAprobacionMovimiento.find(p => p.idEstatus === 1);
        if (activeStep) {
          await tx.pasosAprobacionMovimiento.update({
            where: { idPasoAprobacion: activeStep.idPasoAprobacion },
            data: { idEstatus: 7, idUsuarioAprobador: activeUser.uuid } // 7 = RECHAZADO
          });
        }

        // Marcar el movimiento global como rechazado
        await tx.movimientosInternos.update({
          where: { idMovimiento: movementId },
          data: { idEstatusMovimiento: 7 }
        });

        await tx.historicoMovimientos.create({
          data: {
            idUsuario: activeUser.id,
            idEmpresa: companyId,
            accion: 'RECHAZAR',
            tablaOrigen: 'Empleados',
            idRegistro: String(movement.idEmpleado),
            descripcion: `Solicitud de movimiento rechazada en paso ${activeStep?.paso ?? ''} por ${activeUser.first_name} ${activeUser.last_name}`,
            fechaCreacion: new Date()
          }
        });

        return { message: 'Movimiento rechazado exitosamente.' };
      });
    }

    // APROBACIÓN
    return await this.prisma.$transaction(async (tx) => {
      const activeStep = movement.PasosAprobacionMovimiento.find(p => p.idEstatus === 1);

      if (!activeStep) {
        throw new Error('No hay paso activo pendiente para aprobar.');
      }

      // Marcar paso actual como aprobado
      await tx.pasosAprobacionMovimiento.update({
        where: { idPasoAprobacion: activeStep.idPasoAprobacion },
        data: { idEstatus: 6, idUsuarioAprobador: activeUser.uuid } // 6 = APROBADO
      });

      // ¿Quedan pasos pendientes?
      const remainingSteps = movement.PasosAprobacionMovimiento.filter(
        p => p.idEstatus === 1 && p.idPasoAprobacion !== activeStep.idPasoAprobacion
      );
      const isLastStep = remainingSteps.length === 0;

      if (isLastStep) {
        // ÚLTIMO PASO: aplicar los cambios reales al empleado

        // 1. UPDATE en Empleados
        await tx.empleados.update({
          where: { idEmpleado: movement.idEmpleado },
          data: {
            ...(movement.idPuestoNuevo && { idPuesto: movement.idPuestoNuevo }),
            ...(movement.idJefeNuevo && { idJefeInmediato: movement.idJefeNuevo }),
            ...(movement.idEmpresaNueva && { idEmpresa: movement.idEmpresaNueva }),
            ...(movement.idSiteNuevo && { idSite: movement.idSiteNuevo }),
          }
        });

        // 2. Actualizar salario si se proporcionó uno nuevo
        if (movement.salarioBrutoNuevo && movement.salarioNetoNuevo) {
          const salarioActual = await tx.historialSalarios.findFirst({
            where: { idEmpleado: movement.idEmpleado, actual: true }
          });

          if (salarioActual) {
            await tx.historialSalarios.update({
              where: { idHistorialSalario: salarioActual.idHistorialSalario },
              data: { actual: false }
            });
          }

          await tx.historialSalarios.create({
            data: {
              idEmpleado: movement.idEmpleado,
              idTipoMoneda: salarioActual?.idTipoMoneda ?? 1,
              idPeriodicidadPago: salarioActual?.idPeriodicidadPago ?? 3,
              salarioBruto: movement.salarioBrutoNuevo,
              salarioNeto: movement.salarioNetoNuevo,
              fechaInicio: movement.fechaEfectiva ?? new Date(),
              actual: true,
              fechaRegistro: new Date(),
              usuarioRegistro: activeUser.uuid
            }
          });
        }

        // 3. Marcar movimiento global como APROBADO FINAL
        await tx.movimientosInternos.update({
          where: { idMovimiento: movementId },
          data: { idEstatusMovimiento: 6, idUsuarioAutorizo: activeUser.uuid }
        });

        await tx.historicoMovimientos.create({
          data: {
            idUsuario: activeUser.id,
            idEmpresa: companyId,
            accion: 'APROBAR_FINAL',
            tablaOrigen: 'Empleados',
            idRegistro: String(movement.idEmpleado),
            descripcion: `Movimiento aprobado completamente y aplicado por ${activeUser.first_name} ${activeUser.last_name}`,
            fechaCreacion: new Date()
          }
        });

        return { message: 'Movimiento aprobado y aplicado exitosamente.' };
      } else {
        // Pasos intermedios: el estatus global sigue siendo PENDIENTE (1)
        await tx.historicoMovimientos.create({
          data: {
            idUsuario: activeUser.id,
            idEmpresa: companyId,
            accion: 'APROBAR',
            tablaOrigen: 'Empleados',
            idRegistro: String(movement.idEmpleado),
            descripcion: `Paso ${activeStep.paso} aprobado por ${activeUser.first_name} ${activeUser.last_name}`,
            fechaCreacion: new Date()
          }
        });

        return { message: 'Movimiento avanzado al siguiente paso de aprobación.' };
      }
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
          idEstatusMovimiento: 6, // Aprobación directa para bajas
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
        mi.idEstatusMovimiento,
        cem.descripcion as descripcionEstatus,
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
      LEFT JOIN CatEstatusMovimiento cem ON cem.idEstatusMovimiento = mi.idEstatusMovimiento
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

  async getMovementRequests(companyId: number) {
    const requests = await this.prisma.$queryRaw<any[]>`
      SELECT 
        mi.idMovimiento,
        mi.idEmpleado,
        mi.idEmpresa,
        mi.tipoMovimiento,
        mi.fechaEfectiva,
        mi.motivo,
        mi.idEstatusMovimiento as estatusId,
        cem.descripcion as estatusNombre,
        mi.fechaRegistro,
        TRIM(CONCAT_WS(' ', emp.nombre, emp.primerApellido, emp.segundoApellido)) as empleadoNombreCompleto
      FROM MovimientosInternos mi
      LEFT JOIN CatEstatusMovimiento cem ON cem.idEstatusMovimiento = mi.idEstatusMovimiento
      LEFT JOIN Empleados emp ON emp.idEmpleado = mi.idEmpleado
      WHERE mi.idEmpresa = ${companyId}
      ORDER BY mi.fechaRegistro DESC;
    `;
    return requests;
  }

  async getPendingRequestsForUser(companyId: number, activeUser: ActiveUserDto) {
    const allRequests = await this.getMovementRequests(companyId);
    const pendingForUser: any[] = [];

    for (const req of allRequests) {
      if (req.estatusId === 1) { // 1 = PENDIENTE global (tiene pasos activos)
        try {
          const { permissions } = await this.findMovementById(companyId, req.idMovimiento, activeUser);
          if (permissions.canApproveOrReject) {
            pendingForUser.push(req);
          }
        } catch {
          // Ignore
        }
      }
    }

    return {
      count: pendingForUser.length,
      requests: pendingForUser,
    };
  }
}

