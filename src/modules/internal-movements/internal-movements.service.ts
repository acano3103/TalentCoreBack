import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreateInternalMovementDto } from './dto/create-internal-movement.dto';
import { CreateBajaDto } from './dto/baja.dto';
import { NotificationDispatcher } from '../notifications/notification.dispatcher';
import { ApprovalsService } from '../approvals/approvals.service';
import { QueryInternalMovementsDto } from './dto/query-internal-movements.dto';
import { Prisma } from 'generated/prisma/client';
import { obtenerIniciales } from '../approvals/utils/approvals.utils';
import { ModuloOrigenEnum } from '../approvals/enums/approval-origin.enum';
import { GetInternalMovementRequestDetailDto } from './dto/get-internal-movement-request.detail.dto';

@Injectable()
export class InternalMovementsService {
  constructor(
    private prisma: PrismaService,
    private readonly notifications: NotificationDispatcher,
    private readonly approvalsService: ApprovalsService,
  ) { }

  // async create(
  //   user: ActiveUserDto,
  //   companyId: number,
  //   employeeId: number,
  //   dto: CreateInternalMovementDto,
  // ) {
  //   if (dto.tipoMovimiento === 'Promoción') {
  //     return this.createMovementRequest(user, companyId, dto);
  //   }

  //   return await this.prisma.$transaction(async (tx) => {
  //     // 1. Lee estado actual
  //     const empleadoActual = await tx.empleados.findUnique({
  //       where: { idEmpleado: employeeId },
  //       include: { CatPuestos: true },
  //     });

  //     if (!empleadoActual) {
  //       throw new NotFoundException(
  //         `Empleado con id ${employeeId} no encontrado`,
  //       );
  //     }

  //     const idPuestoAnterior = empleadoActual.idPuesto;
  //     const idAreaAnterior = empleadoActual.CatPuestos?.idArea;
  //     const idJefeAnterior = empleadoActual.idJefeInmediato;
  //     const idEmpresaAnterior = empleadoActual.idEmpresa;
  //     const idSiteAnterior = empleadoActual.idSite;

  //     // 2. Lee salario actual
  //     const salarioActual = await tx.historialSalarios.findFirst({
  //       where: { idEmpleado: employeeId, actual: true },
  //     });

  //     // 3. Update en Empleados
  //     await tx.empleados.update({
  //       where: { idEmpleado: employeeId },
  //       data: {
  //         ...(dto.idPuestoNuevo && { idPuesto: dto.idPuestoNuevo }),
  //         ...(dto.idJefeNuevo && { idJefeInmediato: dto.idJefeNuevo }),
  //         ...(dto.idEmpresaNueva && { idEmpresa: dto.idEmpresaNueva }),
  //         ...(dto.idSiteNuevo && { idSite: dto.idSiteNuevo }),
  //       },
  //     });

  //     // Resolve area nueva if puesto changed
  //     let idAreaNueva: number | null | undefined = undefined;
  //     if (dto.idPuestoNuevo) {
  //       const puestoNuevo = await tx.catPuestos.findUnique({
  //         where: { idPuesto: dto.idPuestoNuevo },
  //       });
  //       idAreaNueva = puestoNuevo?.idArea;
  //     }

  //     // 4. Salario
  //     if (
  //       dto.salarioBrutoNuevo &&
  //       dto.salarioNetoNuevo &&
  //       dto.idTipoMoneda &&
  //       dto.idPeriodicidadPago
  //     ) {
  //       if (salarioActual) {
  //         await tx.historialSalarios.update({
  //           where: { idHistorialSalario: salarioActual.idHistorialSalario },
  //           data: { actual: false },
  //         });
  //       }
  //       await tx.historialSalarios.create({
  //         data: {
  //           idEmpleado: employeeId,
  //           idTipoMoneda: dto.idTipoMoneda,
  //           idPeriodicidadPago: dto.idPeriodicidadPago,
  //           salarioBruto: dto.salarioBrutoNuevo,
  //           salarioNeto: dto.salarioNetoNuevo,
  //           fechaInicio: dto.fechaEfectiva
  //             ? new Date(dto.fechaEfectiva)
  //             : new Date(),
  //           actual: true,
  //           fechaRegistro: new Date(),
  //           usuarioRegistro: user.uuid,
  //         },
  //       });
  //     }

  //     // 5. INSERT MovimientosInternos (aprobación directa para otros tipos de movimiento)
  //     // const movimiento = await tx.movimientosInternos.create({
  //     //   data: {
  //     //     idEmpleado: employeeId,
  //     //     idEmpresa: companyId,
  //     //     // tipoMovimiento: dto.tipoMovimiento,
  //     //     fechaEfectiva: dto.fechaEfectiva
  //     //       ? new Date(dto.fechaEfectiva)
  //     //       : new Date(),
  //     //     idPuestoAnterior,
  //     //     idPuestoNuevo: dto.idPuestoNuevo,
  //     //     idAreaAnterior,
  //     //     idAreaNueva,
  //     //     idJefeAnterior,
  //     //     idJefeNuevo: dto.idJefeNuevo,
  //     //     idEmpresaAnterior,
  //     //     idEmpresaNueva: dto.idEmpresaNueva,
  //     //     idSiteAnterior,
  //     //     idSiteNuevo: dto.idSiteNuevo,
  //     //     salarioBrutoAnterior: salarioActual?.salarioBruto,
  //     //     salarioBrutoNuevo: dto.salarioBrutoNuevo,
  //     //     salarioNetoAnterior: salarioActual?.salarioNeto,
  //     //     salarioNetoNuevo: dto.salarioNetoNuevo,
  //     //     motivo: dto.motivo,
  //     //     idPlanCarrera: dto.idPlanCarrera,
  //     //     // idEstatusMovimiento: 6, // APROBADO directo
  //     //     idUsuarioAutorizo: user.uuid,
  //     //   },
  //     // });

  //     // 6. HistoricoMovimientos
  //     await tx.historicoMovimientos.create({
  //       data: {
  //         idUsuario: user.id,
  //         idEmpresa: companyId,
  //         accion: 'MOVIMIENTO_INTERNO',
  //         tablaOrigen: 'Empleados',
  //         idRegistro: String(employeeId),
  //         descripcion: `${user.first_name} ${user.last_name} autorizó un/a ${dto.tipoMovimiento} para el empleado ${employeeId}`,
  //         fechaCreacion: new Date(),
  //       },
  //     });

  //     // return movimiento;
  //   });
  // }


  async findAll(
    activeUser: ActiveUserDto,
    companyId: number,
    query: QueryInternalMovementsDto,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const search = query.search?.trim();
    const status = query.status;

    const where: Prisma.MovimientosInternosWhereInput = {
      idTenant: activeUser.idTenant,
      idEmpresa: companyId,
    };

    if (status) {
      where.estatus = status;
    }

    if (search) {
      where.OR = [
        {
          motivo: {
            contains: search,
          },
        },
        {
          CatTipoMovimiento: {
            nombre: {
              contains: search,
            },
          },
        },
        {
          CatTipoMovimiento: {
            codigo: {
              contains: search,
            },
          },
        },
        {
          Empleados: {
            nombre: {
              contains: search,
            },
          },
        },
        {
          Empleados: {
            primerApellido: {
              contains: search,
            },
          },
        },
        {
          Empleados: {
            segundoApellido: {
              contains: search,
            },
          },
        },
      ];
    }

    const [total, movimientos] = await this.prisma.$transaction([
      this.prisma.movimientosInternos.count({
        where,
      }),
      this.prisma.movimientosInternos.findMany({
        where,
        include: {
          Empleados: {
            select: {
              idEmpleado: true,
              numeroEmpleado: true,
              nombre: true,
              primerApellido: true,
              segundoApellido: true,
              idJefeInmediato: true,
              CatPuestos: {
                select: {
                  idPuesto: true,
                  idArea: true,
                },
              },
            },
          },
          CatTipoMovimiento: true,
        },
        orderBy: [
          { fechaRegistro: 'desc' },
          { idMovimiento: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const requests = movimientos.map((movimiento) => {
      const empleado = movimiento.Empleados;

      const nombre = empleado?.nombre?.trim() ?? '';
      const primerApellido = empleado?.primerApellido?.trim() ?? '';
      const segundoApellido = empleado?.segundoApellido?.trim() ?? '';

      const empleadoNombreCompleto = [
        nombre,
        primerApellido,
        segundoApellido,
      ]
        .filter(Boolean)
        .join(' ');

      return {
        idOrigen: movimiento.idMovimiento,
        origenModulo: ModuloOrigenEnum.MOVIMIENTO_INTERNO,
        idEmpleado: empleado?.idEmpleado ?? movimiento.idEmpleado,
        numeroEmpleado: empleado?.numeroEmpleado ?? 'Sin número de empleado',
        empleadoNombreCompleto:
          empleadoNombreCompleto || 'Sin empleado',
        empleadoIniciales: obtenerIniciales(nombre, primerApellido),
        comentarioOMotivo: movimiento.motivo ?? null,
        idTipoMovimiento: movimiento.idTipoMovimiento,
        tipoMovimientoNombre:
          movimiento.CatTipoMovimiento?.nombre ?? 'Movimiento interno',
        codigoTipoSolicitud:
          movimiento.CatTipoMovimiento?.codigo ?? 'MOVIMIENTO_INTERNO',
        estatusCodigo: movimiento.estatus,
        estatusNombre: movimiento.estatus,
        fechaSolicitud: movimiento.fechaRegistro,
        solicitud: movimiento,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      requests,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getInternalMovementRequestDetail(activeUser: ActiveUserDto, companyId: number, query: GetInternalMovementRequestDetailDto) {
    if (query.origenModulo !== 'MOVIMIENTO_INTERNO') {
      throw new BadRequestException('El módulo de la solicitud no es válido.');
    }

    const movimiento = await this.prisma.movimientosInternos.findFirst({
      where: {
        idMovimiento: query.idOrigen,
        idTenant: activeUser.idTenant,
        idEmpresa: companyId,
      },
      include: {
        Empleados: {
          select: {
            idEmpleado: true,
            nombre: true,
            primerApellido: true,
            segundoApellido: true,
          },
        },
        CatTipoMovimiento: {
          select: {
            nombre: true,
            codigo: true,
          },
        },
      },
    });

    if (!movimiento) {
      throw new NotFoundException('El movimiento interno no existe.');
    }

    const empleado = movimiento.Empleados;

    const nombreCompleto = [empleado?.nombre, empleado?.primerApellido, empleado?.segundoApellido].filter(Boolean).join(' ');

    const request = {
      idOrigen: movimiento.idMovimiento,
      origenModulo: ModuloOrigenEnum.MOVIMIENTO_INTERNO,
      idEmpleado: empleado?.idEmpleado ?? movimiento.idEmpleado,
      empleadoNombreCompleto: nombreCompleto || 'Sin empleado',
      empleadoIniciales: obtenerIniciales(empleado?.nombre ?? '', empleado?.primerApellido ?? ''),
      comentarios: movimiento.motivo ?? null,
      idTipoMovimiento: movimiento.idTipoMovimiento,
      tipoMovimientoNombre: movimiento.CatTipoMovimiento?.nombre ?? 'Movimiento interno',
      codigoTipoSolicitud: movimiento.CatTipoMovimiento?.codigo ?? 'MOVIMIENTO_INTERNO',
      estatusCodigo: movimiento.estatus,
      estatusNombre: movimiento.estatus,
      fechaSolicitud: movimiento.fechaRegistro,
      pasoActual: movimiento.pasoActual ?? 1,
    };

    return this.obtenerDetalleMovimientoAutorizado(
      activeUser,
      companyId,
      request,
      false
    );
  }

  async createMovementRequest(
    user: ActiveUserDto,
    companyId: number,
    dto: CreateInternalMovementDto,
  ) {
    const employeeId = dto.idEmpleado;

    // 1. Identificar al solicitante activo en la empresa y tenant.
    const requesterEmployee = await this.prisma.empleados.findFirst({
      where: {
        idUsuario: user.uuid,
        idEmpresa: companyId,
        idTenant: user.idTenant,
        activo: true,
      },
      select: {
        idEmpleado: true,
      },
    });

    if (!requesterEmployee) {
      throw new NotFoundException(
        'El usuario en sesión no cuenta con un empleado activo en esta empresa.',
      );
    }

    // 2. Validar el tipo de movimiento.
    const tipoMovimiento = await this.prisma.catTipoMovimiento.findFirst({
      where: {
        nombre: dto.tipoMovimiento,
        idModuloFlujo: 2,
        activo: true,
      },
    });

    if (!tipoMovimiento) {
      throw new BadRequestException(
        'El tipo de movimiento no existe, está inactivo o no pertenece al módulo de movimientos internos.',
      );
    }

    // 3. Crear la solicitud sin modificar al empleado.
    const movimiento = await this.prisma.$transaction(async (tx) => {
      const empleadoActual = await tx.empleados.findFirst({
        where: {
          idEmpleado: employeeId,
          idEmpresa: companyId,
          idTenant: user.idTenant,
          activo: true,
        },
        include: {
          CatPuestos: true,
        },
      });

      if (!empleadoActual) {
        throw new NotFoundException(
          `No se encontró el empleado ${employeeId} activo en esta empresa.`,
        );
      }

      // Obtener los datos actuales para conservarlos como referencia.
      const salarioActual = await tx.historialSalarios.findFirst({
        where: {
          idEmpleado: employeeId,
          actual: true,
        },
      });

      let idAreaNueva: number | null = null;

      if (dto.idPuestoNuevo != null) {
        const puestoNuevo = await tx.catPuestos.findUnique({
          where: {
            idPuesto: dto.idPuestoNuevo,
          },
          select: {
            idArea: true,
          },
        });

        if (!puestoNuevo) {
          throw new BadRequestException(
            'El puesto nuevo especificado no existe.',
          );
        }

        idAreaNueva = puestoNuevo.idArea;
      }

      // Guardar la solicitud. No se actualiza Empleados ni salarios aquí.
      const nuevaSolicitud = await tx.movimientosInternos.create({
        data: {
          idTenant: user.idTenant,
          idEmpresa: companyId,
          idEmpleado: employeeId,
          idTipoMovimiento: tipoMovimiento.idTipoMovimiento,
          solicitadoPorIdEmpleado: requesterEmployee.idEmpleado,
          fechaEfectiva: dto.fechaEfectiva ? new Date(dto.fechaEfectiva) : null,
          idPuestoAnterior: empleadoActual.idPuesto,
          idPuestoNuevo: dto.idPuestoNuevo ?? null,
          idAreaAnterior: empleadoActual.CatPuestos?.idArea ?? null,
          idAreaNueva,
          idJefeAnterior: empleadoActual.idJefeInmediato,
          idJefeNuevo: dto.idJefeNuevo ?? empleadoActual.idJefeInmediato,
          idEmpresaAnterior: empleadoActual.idEmpresa,
          idEmpresaNueva: dto.idEmpresaNueva ?? null,
          idSiteAnterior: empleadoActual.idSite,
          idSiteNuevo: dto.idSiteNuevo ?? null,
          salarioBrutoAnterior: salarioActual?.salarioBruto ?? null,
          salarioBrutoNuevo: dto.salarioBrutoNuevo ?? null,
          salarioNetoAnterior: salarioActual?.salarioNeto ?? null,
          salarioNetoNuevo: dto.salarioNetoNuevo ?? null,
          idTipoMoneda: dto.idTipoMoneda ?? null,
          idPeriodicidadPago: dto.idPeriodicidadPago ?? null,
          motivo: dto.motivo ?? null,
          idPlanCarrera: dto.idPlanCarrera ?? null,
          estatus: 'PENDIENTE',
          pasoActual: 1,
          totalPasos: 1,
          idAprobador: null,
          fechaRespuesta: null,
          motivoRechazo: null,
          idUsuarioAutorizo: null,
        },
      });

      await tx.historicoMovimientos.create({
        data: {
          idUsuario: user.id,
          idEmpresa: companyId,
          accion: 'SOLICITUD_MOVIMIENTO',
          tablaOrigen: 'MovimientosInternos',
          idRegistro: String(nuevaSolicitud.idMovimiento),
          descripcion:
            `${user.first_name} ${user.last_name} solicitó ` +
            `${tipoMovimiento.nombre} para el empleado ${employeeId}.`,
          fechaCreacion: new Date(),
        },
      });

      return nuevaSolicitud;
    });

    // 4. Ejecutar el motor de aprobación después de crear la solicitud.
    // idMovimiento funciona como identificador de esta solicitud.
    const resultadoAprobacion = await this.approvalsService.aprobarAutomaticamenteSinFlujoAprobacion(
      user.idTenant,
      companyId,
      tipoMovimiento.idTipoMovimiento,
      movimiento.idMovimiento,
      'MOVIMIENTO_INTERNO',
    );

    // 5. Solo aplicar los cambios al empleado si fue aprobada
    // automáticamente por no existir un flujo configurado.
    if (resultadoAprobacion == 'Solicitud aprobada automaticamente por falta de flujo de aprobación.') {
      await this.aplicarMovimientoAEmpleado(movimiento.idMovimiento, user);
    }

    // 6. Devolver el estado real de la solicitud.
    const solicitudActualizada =
      await this.prisma.movimientosInternos.findUnique({
        where: {
          idMovimiento: movimiento.idMovimiento,
        },
      });

    return {
      message: resultadoAprobacion == 'Solicitud aprobada automaticamente por falta de flujo de aprobación.'
        ? 'Movimiento aprobado automáticamente y aplicado al empleado.'
        : 'Solicitud de movimiento registrada y enviada al flujo de aprobación.',
      data: solicitudActualizada,
    };
  }


  async aplicarMovimientoAEmpleado(
    idMovimiento: number,
    user?: ActiveUserDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Recuperar la solicitud del movimiento.
      const movimiento = await tx.movimientosInternos.findUnique({
        where: { idMovimiento },
      });

      if (!movimiento) {
        throw new NotFoundException(
          `No se encontró el movimiento ${idMovimiento}.`,
        );
      }

      // 2. Recuperar al empleado.
      const empleado = await tx.empleados.findFirst({
        where: {
          idEmpleado: movimiento.idEmpleado,
          idTenant: movimiento.idTenant,
          activo: true,
        },
      });

      if (!empleado) {
        throw new NotFoundException(
          `No se encontró el empleado ${movimiento.idEmpleado} activo.`,
        );
      }

      // 3. Actualizar únicamente los campos solicitados.
      const empleadoActualizado = await tx.empleados.update({
        where: {
          idEmpleado: empleado.idEmpleado,
        },
        data: {
          ...(movimiento.idPuestoNuevo != null && {
            idPuesto: movimiento.idPuestoNuevo,
          }),
          ...(movimiento.idJefeNuevo != null && {
            idJefeInmediato: movimiento.idJefeNuevo,
          }),
          ...(movimiento.idEmpresaNueva != null && {
            idEmpresa: movimiento.idEmpresaNueva,
          }),
          ...(movimiento.idSiteNuevo != null && {
            idSite: movimiento.idSiteNuevo,
          }),
        },
      });

      // 4. Actualizar el historial salarial cuando exista
      // un cambio de salario solicitado.
      const cambiaSalario = movimiento.salarioBrutoNuevo != null || movimiento.salarioNetoNuevo != null;

      if (cambiaSalario) {
        const salarioActual = await tx.historialSalarios.findFirst({
          where: {
            idEmpleado: empleado.idEmpleado,
            actual: true,
          },
        });

        const salarioBrutoNuevo =
          movimiento.salarioBrutoNuevo ??
          salarioActual?.salarioBruto;

        const salarioNetoNuevo =
          movimiento.salarioNetoNuevo ??
          salarioActual?.salarioNeto;

        const idTipoMoneda =
          movimiento.idTipoMoneda ??
          salarioActual?.idTipoMoneda;

        const idPeriodicidadPago =
          movimiento.idPeriodicidadPago ??
          salarioActual?.idPeriodicidadPago;

        // HistorialSalarios requiere ambos importes.
        if (salarioBrutoNuevo == null || salarioNetoNuevo == null) {
          throw new BadRequestException(
            'No es posible registrar el nuevo salario porque falta el salario bruto o neto.',
          );
        }

        if (idTipoMoneda == null || idPeriodicidadPago == null) {
          throw new BadRequestException(
            'No es posible registrar el nuevo salario porque falta el tipo de moneda o la periodicidad de pago.',
          );
        }

        // Desactivar el registro salarial vigente.
        if (salarioActual) {
          await tx.historialSalarios.update({
            where: {
              idHistorialSalario:
                salarioActual.idHistorialSalario,
            },
            data: {
              actual: false,
            },
          });
        }

        // Crear el nuevo registro salarial.
        await tx.historialSalarios.create({
          data: {
            idEmpleado: empleado.idEmpleado,
            idTipoMoneda: idTipoMoneda,
            idPeriodicidadPago: idPeriodicidadPago,
            salarioBruto: salarioBrutoNuevo,
            salarioNeto: salarioNetoNuevo,
            fechaInicio: movimiento.fechaEfectiva ?? new Date(),
            actual: true,
            usuarioRegistro: user ? `${user.first_name} ${user.last_name}` : null,
          },
        });
      }

      if (movimiento.idUsuarioAutorizo !== undefined) {
        // 5. Registrar la aplicación del movimiento en el histórico.
        await tx.historicoMovimientos.create({
          data: {
            idUsuario: user?.id || 0,
            idEmpresa: movimiento.idEmpresaNueva ?? movimiento.idEmpresa,
            accion: 'APLICACION_MOVIMIENTO',
            tablaOrigen: 'MovimientosInternos',
            idRegistro: String(movimiento.idMovimiento),
            descripcion:
              `Se aplicó el movimiento ${movimiento.idMovimiento} ` +
              `al empleado ${movimiento.idEmpleado}.`,
            fechaCreacion: new Date(),
          },
        });
      }

      return {
        message: 'Movimiento aplicado correctamente al empleado.',
        data: {
          movimiento,
          empleado: empleadoActualizado,
        },
      };
    });
  }

  // ----------------------------------------------------------
  // Helpers 
  // ----------------------------------------------------------

  private async construirFlujoMovimientoInterno(
    activeUser: ActiveUserDto,
    companyId: number,
    solicitud: {
      idMovimiento: number;
      idTenant: number;
      idEmpresa: number;
      idTipoMovimiento: number;
      estatus: string;
      pasoActual: number | null;
      motivo: string | null;
      fechaRespuesta: Date | null;
      motivoRechazo: string | null;
    },
    request: any,
  ) {
    // 1. Consultar los pasos de aprobación configurados.
    const flujoConfigurado =
      await this.prisma.configuracionFlujoPaso.findMany({
        where: {
          idTenant: activeUser.idTenant,
          idEmpresa: companyId,
          idTipoMovimiento: solicitud.idTipoMovimiento,
          activo: true,
        },
        orderBy: {
          paso: 'asc',
        },
        select: {
          idConfiguracionPaso: true,
          paso: true,
          codigoTipoSolicitud: true,
          idModuloFlujo: true,
          tipoAprobador: true,
          nivelJerarquia: true,
          autoAprobarSiSolicitante: true,
          idRolAprobador: true,
          modoAsignacionRol: true,
          idUsuarioFijoRol: true,
        },
      });

    // 2. Consultar los pasos ejecutados.
    const pasosEjecutados =
      await this.prisma.pasosAprobacionMovimientoInterno.findMany({
        where: {
          idMovimiento: solicitud.idMovimiento,
        },
        orderBy: {
          paso: 'asc',
        },
        select: {
          idPasoAprobacion: true,
          idMovimiento: true,
          paso: true,
          tipoAprobador: true,
          idRolAprobador: true,
          estatus: true,
          idUsuarioAprobador: true,
          idEmpleadoAprobador: true,
          comentarios: true,
          fechaRespuesta: true,
        },
      });

    // 3. Buscar los usuarios que respondieron.
    const usuariosIds = [
      ...new Set(
        pasosEjecutados
          .map((paso) => paso.idUsuarioAprobador)
          .filter(
            (id): id is string => Boolean(id),
          ),
      ),
    ];

    const usuarios = usuariosIds.length
      ? await this.prisma.auth_user.findMany({
        where: {
          idTenant: activeUser.idTenant,
          uuid: {
            in: usuariosIds,
          },
        },
        select: {
          uuid: true,
          first_name: true,
          last_name: true,
          username: true,
        },
      })
      : [];

    const usuariosMap = new Map(
      usuarios.map((usuario) => [
        usuario.uuid,
        `${usuario.first_name ?? ''} ${usuario.last_name ?? ''
          }`.trim() || usuario.username,
      ]),
    );

    // 4. Resolver los roles.
    const rolesIds = [
      ...new Set(
        [
          ...flujoConfigurado.map(
            (paso) => paso.idRolAprobador,
          ),
          ...pasosEjecutados.map(
            (paso) => paso.idRolAprobador,
          ),
        ].filter(
          (id): id is number => id !== null,
        ),
      ),
    ];

    const roles = rolesIds.length
      ? await this.prisma.catRoles.findMany({
        where: {
          idTenant: activeUser.idTenant,
          idRol: {
            in: rolesIds,
          },
        },
        select: {
          idRol: true,
          descripcion: true,
        },
      })
      : [];

    const rolesMap = new Map(
      roles.map((rol) => [
        rol.idRol,
        rol.descripcion,
      ]),
    );

    // 5. Asociar pasos ejecutados con configuración.
    const pasosMap = new Map(
      pasosEjecutados.map((paso) => [
        paso.paso,
        paso,
      ]),
    );

    let pasos;

    if (flujoConfigurado.length > 0) {
      // Existe flujo configurado.
      pasos = flujoConfigurado.map((config) => {
        const ejecutado = pasosMap.get(config.paso);

        return {
          paso: config.paso,
          estatus: ejecutado?.estatus ?? 'PENDIENTE',
          tipoAprobador: config.tipoAprobador,
          nivelJerarquia: config.nivelJerarquia,
          idRolAprobador: config.idRolAprobador,
          nombreRolAprobador:
            config.idRolAprobador
              ? rolesMap.get(
                config.idRolAprobador,
              ) ?? null
              : null,
          modoAsignacionRol: config.modoAsignacionRol,
          idUsuarioFijoRol: config.idUsuarioFijoRol,
          idPasoAprobacion: ejecutado?.idPasoAprobacion ?? null,
          idUsuarioAprobador: ejecutado?.idUsuarioAprobador ?? null,
          idEmpleadoAprobador: ejecutado?.idEmpleadoAprobador ?? null,
          nombreUsuarioAprobador:
            ejecutado?.idUsuarioAprobador
              ? usuariosMap.get(
                ejecutado.idUsuarioAprobador,
              ) ?? null
              : null,
          comentarios: ejecutado?.comentarios ?? null,
          fechaRespuesta: ejecutado?.fechaRespuesta ?? null,
        };
      });
    } else if (pasosEjecutados.length > 0) {
      // No hay flujo configurado, pero sí historial.
      pasos = pasosEjecutados.map(
        (ejecutado) => ({
          paso: ejecutado.paso,
          estatus: ejecutado.estatus,
          tipoAprobador: ejecutado.tipoAprobador,
          nivelJerarquia: null,
          idRolAprobador: ejecutado.idRolAprobador,
          nombreRolAprobador:
            ejecutado.idRolAprobador
              ? rolesMap.get(
                ejecutado.idRolAprobador,
              ) ?? null
              : null,
          modoAsignacionRol: null,
          idUsuarioFijoRol: null,
          idPasoAprobacion: ejecutado.idPasoAprobacion,
          idUsuarioAprobador: ejecutado.idUsuarioAprobador,
          idEmpleadoAprobador: ejecutado.idEmpleadoAprobador,
          nombreUsuarioAprobador:
            ejecutado.idUsuarioAprobador
              ? usuariosMap.get(
                ejecutado.idUsuarioAprobador,
              ) ?? null
              : null,
          comentarios:
            ejecutado.comentarios ??
            'Solicitud aprobada automáticamente por falta de flujo de aprobación.',
          fechaRespuesta: ejecutado.fechaRespuesta,
        }),
      );

    } else {
      // No existe configuración ni historial.
      pasos = [
        {
          paso: solicitud.pasoActual ?? request.pasoActual ?? 1,
          estatus: solicitud.estatus,
          tipoAprobador: 'AUTOMATICO',
          nivelJerarquia: null,
          idRolAprobador: null,
          nombreRolAprobador: null,
          modoAsignacionRol: null,
          idUsuarioFijoRol: null,
          idPasoAprobacion: null,
          idUsuarioAprobador: null,
          idEmpleadoAprobador: null,
          nombreUsuarioAprobador: null,
          comentarios:
            solicitud.motivo ??
            solicitud.motivoRechazo ??
            'Solicitud aprobada automáticamente por falta de flujo de aprobación.',
          fechaRespuesta: solicitud.fechaRespuesta,
        },
      ];
    }

    const pasoActual = pasos.find(
      (paso) =>
        paso.estatus === 'PENDIENTE' &&
        paso.paso ===
        (solicitud.pasoActual ??
          request.pasoActual),
    );

    return {
      pasoActual:
        pasoActual?.paso ??
        solicitud.pasoActual ??
        request.pasoActual ??
        null,
      totalPasos: pasos.length,
      pasos,
      tieneFlujoConfigurado: flujoConfigurado.length > 0,
      aprobacionAutomatica: flujoConfigurado.length === 0,
    };
  }


  //   async findMovementById(
  //     companyId: number,
  //     movementId: number,
  //     activeUser: ActiveUserDto,
  //   ) {
  //     const movement = await this.prisma.movimientosInternos.findFirst({
  //       where: {
  //         idMovimiento: movementId,
  //         idEmpresa: companyId,
  //       },
  //     });

  //     if (!movement) {
  //       throw new NotFoundException(
  //         `El movimiento interno ${movementId} no existe o no pertenece a tu empresa`,
  //       );
  //     }

  //     const userRoles = await this.prisma.relUsuarioRol.findMany({
  //       where: {
  //         idUsuario: activeUser.id,
  //         activo: true,
  //       },
  //     });

  //     const roleIds = userRoles.map((r) => r.idRol);

  //     let canApproveOrReject = false;
  //     let userContextRole = 'VIEWER';

  //     // const status = movement.idEstatusMovimiento;

  //     // 1 = PENDIENTE_MANAGER
  //     if (status === 1) {
  //       const bossResult = await this.prisma.$queryRaw<any[]>`
  //         SELECT u.uuid
  //         FROM Empleados emp
  //         JOIN Empleados jefe ON emp.idJefeInmediato = jefe.idEmpleado
  //         JOIN auth_user u ON jefe.idUsuario = u.uuid
  //         WHERE emp.idEmpleado = ${movement.idEmpleado}
  //           AND emp.idEmpresa = ${companyId}
  //           AND jefe.activo = 1
  //           AND u.is_active = 1
  //       `;

  //       if (
  //         (bossResult &&
  //           bossResult.length > 0 &&
  //           bossResult[0].uuid === activeUser.uuid) ||
  //         roleIds.includes(1) ||
  //         roleIds.includes(5)
  //       ) {
  //         canApproveOrReject = true;
  //         userContextRole = 'JEFE_INMEDIATO';
  //       }
  //     }
  //     // 2 = APROBADO_MANAGER -> Pendiente RH (idRol = 2)
  //     else if (status === 2) {
  //       if (roleIds.includes(2) || roleIds.includes(1)) {
  //         canApproveOrReject = true;
  //         userContextRole = 'RECURSOS_HUMANOS';
  //       }
  //     }
  //     // 3 = APROBADO_RH -> Pendiente Finanzas (idRol = 3)
  //     else if (status === 3) {
  //       if (roleIds.includes(3) || roleIds.includes(1)) {
  //         canApproveOrReject = true;
  //         userContextRole = 'FINANZAS';
  //       }
  //     }
  //     // 4 = APROBADO_FINANZAS -> Pendiente Director de Área (idRol = 5 o 1)
  //     else if (status === 4) {
  //       if (roleIds.includes(5) || roleIds.includes(1)) {
  //         canApproveOrReject = true;
  //         userContextRole = 'DIRECTOR_AREA';
  //       }
  //     }
  //     // 5 = APROBADO_DIRECTOR_AREA -> Pendiente Dirección General (idRol = 1)
  //     else if (status === 5) {
  //       if (roleIds.includes(1)) {
  //         canApproveOrReject = true;
  //         userContextRole = 'DIRECCION_GENERAL';
  //       }
  //     }

  //     return {
  //       movement,
  //       permissions: {
  //         canApproveOrReject,
  //         userContextRole,
  //       },
  //     };
  //   }

  //   async evaluateMovement(
  //     companyId: number,
  //     movementId: number,
  //     action: 'aprobar' | 'rechazar',
  //     activeUser: ActiveUserDto,
  //   ) {
  //     const { movement, permissions } = await this.findMovementById(
  //       companyId,
  //       movementId,
  //       activeUser,
  //     );

  //     if (!permissions.canApproveOrReject) {
  //       throw new ForbiddenException(
  //         'No tienes privilegios para dictaminar este movimiento en su estatus actual.',
  //       );
  //     }

  //     if (action === 'rechazar') {
  //       await this.prisma.movimientosInternos.update({
  //         where: { idMovimiento: movementId },
  //         data: { idEstatusMovimiento: 7 }, // 7 = RECHAZADO
  //       });

  //       await this.prisma.historicoMovimientos.create({
  //         data: {
  //           idUsuario: activeUser.id,
  //           idEmpresa: companyId,
  //           accion: 'RECHAZAR',
  //           tablaOrigen: 'Empleados',
  //           idRegistro: String(movement.idEmpleado),
  //           descripcion: `Solicitud de movimiento de promoción rechazada por ${activeUser.first_name} ${activeUser.last_name}`,
  //           fechaCreacion: new Date(),
  //         },
  //       });

  //       return { message: 'Movimiento rechazado exitosamente.' };
  //     }

  //     // APROBACIÓN
  //     const currentStatus = movement.idEstatusMovimiento;
  //     const nextStatus = currentStatus + 1; // Avance secuencial: 1->2, 2->3, 3->4, 4->5, 5->6

  //     return await this.prisma.$transaction(async (tx) => {
  //       // Si llegamos a Estatus 6 (APROBADO final), aplicamos los cambios reales al empleado
  //       if (nextStatus === 6) {
  //         // 1. UPDATE en Empleados
  //         await tx.empleados.update({
  //           where: { idEmpleado: movement.idEmpleado },
  //           data: {
  //             ...(movement.idPuestoNuevo && { idPuesto: movement.idPuestoNuevo }),
  //             ...(movement.idJefeNuevo && {
  //               idJefeInmediato: movement.idJefeNuevo,
  //             }),
  //             ...(movement.idEmpresaNueva && {
  //               idEmpresa: movement.idEmpresaNueva,
  //             }),
  //             ...(movement.idSiteNuevo && { idSite: movement.idSiteNuevo }),
  //           },
  //         });

  //         // 2. Salario
  //         if (movement.salarioBrutoNuevo && movement.salarioNetoNuevo) {
  //           const salarioActual = await tx.historialSalarios.findFirst({
  //             where: { idEmpleado: movement.idEmpleado, actual: true },
  //           });

  //           if (salarioActual) {
  //             await tx.historialSalarios.update({
  //               where: { idHistorialSalario: salarioActual.idHistorialSalario },
  //               data: { actual: false },
  //             });
  //           }

  //           await tx.historialSalarios.create({
  //             data: {
  //               idEmpleado: movement.idEmpleado,
  //               idTipoMoneda: salarioActual?.idTipoMoneda ?? 1,
  //               idPeriodicidadPago: salarioActual?.idPeriodicidadPago ?? 3,
  //               salarioBruto: movement.salarioBrutoNuevo,
  //               salarioNeto: movement.salarioNetoNuevo,
  //               fechaInicio: movement.fechaEfectiva ?? new Date(),
  //               actual: true,
  //               fechaRegistro: new Date(),
  //               usuarioRegistro: activeUser.uuid,
  //             },
  //           });
  //         }

  //         // 3. Actualizar movimiento con estatus final y autorizador
  //         await tx.movimientosInternos.update({
  //           where: { idMovimiento: movementId },
  //           data: {
  //             idEstatusMovimiento: 6,
  //             idUsuarioAutorizo: activeUser.uuid,
  //           },
  //         });

  //         // 4. Si el movimiento proviene de Plan de Carrera, marcar la postulación como promovida
  //         if (movement.idPlanCarrera != null) {
  //           await tx.planCarreraColaborador.update({
  //             where: { idPlanCarrera: movement.idPlanCarrera },
  //             data: { estatus: 'promovido', fechaPromocion: new Date() },
  //           });
  //         }
  //       } else {
  //         // Avance de estatus intermedio
  //         await tx.movimientosInternos.update({
  //           where: { idMovimiento: movementId },
  //           data: { idEstatusMovimiento: nextStatus },
  //         });
  //       }

  //       // Registro en HistoricoMovimientos
  //       await tx.historicoMovimientos.create({
  //         data: {
  //           idUsuario: activeUser.id,
  //           idEmpresa: companyId,
  //           accion: nextStatus === 6 ? 'APROBAR_FINAL' : 'APROBAR',
  //           tablaOrigen: 'Empleados',
  //           idRegistro: String(movement.idEmpleado),
  //           descripcion:
  //             nextStatus === 6
  //               ? `Promoción aprobada y aplicada exitosamente por ${activeUser.first_name} ${activeUser.last_name}`
  //               : `Solicitud de promoción avanzada al estatus ${nextStatus} por ${activeUser.first_name} ${activeUser.last_name}`,
  //           fechaCreacion: new Date(),
  //         },
  //       });

  //       return {
  //         message:
  //           nextStatus === 6
  //             ? 'Movimiento aprobado y aplicado exitosamente.'
  //             : 'Movimiento avanzado al siguiente estatus de aprobación.',
  //       };
  //     });
  //   }

  //   async createBaja(
  //     user: ActiveUserDto,
  //     companyId: number,
  //     employeeId: number,
  //     dto: CreateBajaDto,
  //   ) {
  //     return await this.prisma.$transaction(async (tx) => {
  //       // 1. UPDATE en Empleados: activo = false.
  //       await tx.empleados.update({
  //         where: { idEmpleado: employeeId },
  //         data: { activo: false },
  //       });

  //       // 2. INSERT en MovimientosInternos
  //       const movimiento = await tx.movimientosInternos.create({
  //         data: {
  //           idEmpleado: employeeId,
  //           idEmpresa: companyId,
  //           tipoMovimiento: 'BAJA',
  //           fechaEfectiva: new Date(dto.fechaBaja),
  //           causaBaja: dto.causaBaja,
  //           idUsuarioAutorizo: user.uuid,
  //           idEstatusMovimiento: 6, // Aprobación directa para bajas
  //         },
  //       });

  //       // 3. INSERT en HistoricoMovimientos
  //       await tx.historicoMovimientos.create({
  //         data: {
  //           idUsuario: user.id,
  //           idEmpresa: companyId,
  //           accion: 'BAJA_EMPLEADO',
  //           tablaOrigen: 'Empleados',
  //           idRegistro: String(employeeId),
  //           descripcion: `${user.first_name} ${user.last_name} autorizó la baja para el empleado ${employeeId}`,
  //           fechaCreacion: new Date(),
  //         },
  //       });

  //       return movimiento;
  //     });
  //   }

  //   async findByEmployee(companyId: number, employeeId: number) {
  //     return this.prisma.$queryRaw`
  //       SELECT
  //         mi.idMovimiento,
  //         mi.idEmpleado,
  //         mi.idEmpresa,
  //         mi.tipoMovimiento,
  //         mi.fechaEfectiva,
  //         mi.idPuestoAnterior,
  //         mi.idPuestoNuevo,
  //         mi.idAreaAnterior,
  //         mi.idAreaNueva,
  //         mi.idJefeAnterior,
  //         mi.idJefeNuevo,
  //         mi.idEmpresaAnterior,
  //         mi.idEmpresaNueva,
  //         mi.idSiteAnterior,
  //         mi.idSiteNuevo,
  //         mi.salarioBrutoAnterior,
  //         mi.salarioBrutoNuevo,
  //         mi.salarioNetoAnterior,
  //         mi.salarioNetoNuevo,
  //         mi.motivo,
  //         mi.causaBaja,
  //         mi.idUsuarioAutorizo,
  //         mi.idEstatusMovimiento,
  //         cem.descripcion as descripcionEstatus,
  //         mi.fechaRegistro,
  //         puestoAnt.NombrePuesto as nombrePuestoAnterior,
  //         puestoNuevo.NombrePuesto as nombrePuestoNuevo,
  //         areaAnt.Descripcion as nombreAreaAnterior,
  //         areaNueva.Descripcion as nombreAreaNueva,
  //         TRIM(CONCAT_WS(' ', jefeAnt.nombre, jefeAnt.primerApellido, jefeAnt.segundoApellido)) as nombreJefeAnterior,
  //         TRIM(CONCAT_WS(' ', jefeNuevo.nombre, jefeNuevo.primerApellido, jefeNuevo.segundoApellido)) as nombreJefeNuevo,
  //         siteAnt.Descripcion as nombreSiteAnterior,
  //         siteNuevo.Descripcion as nombreSiteNuevo
  //       FROM MovimientosInternos mi
  //       LEFT JOIN CatEstatusMovimiento cem ON cem.idEstatusMovimiento = mi.idEstatusMovimiento
  //       LEFT JOIN CatPuestos puestoAnt ON puestoAnt.idPuesto = mi.idPuestoAnterior
  //       LEFT JOIN CatPuestos puestoNuevo ON puestoNuevo.idPuesto = mi.idPuestoNuevo
  //       LEFT JOIN CatAreas areaAnt ON areaAnt.idArea = mi.idAreaAnterior
  //       LEFT JOIN CatAreas areaNueva ON areaNueva.idArea = mi.idAreaNueva
  //       LEFT JOIN Empleados jefeAnt ON jefeAnt.idEmpleado = mi.idJefeAnterior
  //       LEFT JOIN Empleados jefeNuevo ON jefeNuevo.idEmpleado = mi.idJefeNuevo
  //       LEFT JOIN CatSites siteAnt ON siteAnt.idSite = mi.idSiteAnterior
  //       LEFT JOIN CatSites siteNuevo ON siteNuevo.idSite = mi.idSiteNuevo
  //       WHERE mi.idEmpleado = ${employeeId} AND mi.idEmpresa = ${companyId}
  //       ORDER BY mi.fechaEfectiva DESC;
  //     `;
  //   }

  //   async getMovementRequests(companyId: number) {
  //     const requests = await this.prisma.$queryRaw<any[]>`
  //       SELECT
  //         mi.idMovimiento,
  //         mi.idEmpleado,
  //         mi.idEmpresa,
  //         mi.tipoMovimiento,
  //         mi.fechaEfectiva,
  //         mi.motivo,
  //         mi.idEstatusMovimiento as estatusId,
  //         cem.descripcion as estatusNombre,
  //         mi.fechaRegistro,
  //         TRIM(CONCAT_WS(' ', emp.nombre, emp.primerApellido, emp.segundoApellido)) as empleadoNombreCompleto
  //       FROM MovimientosInternos mi
  //       LEFT JOIN CatEstatusMovimiento cem ON cem.idEstatusMovimiento = mi.idEstatusMovimiento
  //       LEFT JOIN Empleados emp ON emp.idEmpleado = mi.idEmpleado
  //       WHERE mi.idEmpresa = ${companyId}
  //       ORDER BY mi.fechaRegistro DESC;
  //     `;
  //     return requests;
  //   }

  //   async getPendingRequestsForUser(
  //     companyId: number,
  //     activeUser: ActiveUserDto,
  //   ) {
  //     const allRequests = await this.getMovementRequests(companyId);
  //     const pendingForUser: any[] = [];

  //     for (const req of allRequests) {
  //       if (req.estatusId >= 1 && req.estatusId <= 5) {
  //         try {
  //           const { permissions } = await this.findMovementById(
  //             companyId,
  //             req.idMovimiento,
  //             activeUser,
  //           );
  //           if (permissions.canApproveOrReject) {
  //             pendingForUser.push(req);
  //           }
  //         } catch {
  //           // Ignore
  //         }
  //       }
  //     }

  //     return {
  //       count: pendingForUser.length,
  //       requests: pendingForUser,
  //     };
  //   }

  async obtenerDetalleMovimientoAutorizado(
    activeUser: ActiveUserDto,
    companyId: number,
    request: any,
    soloPendientes: boolean = false
  ) {

    if (request.origenModulo !== 'MOVIMIENTO_INTERNO') {
      throw new BadRequestException('El módulo de la solicitud no es válido.');
    }

    const movimiento = await this.prisma.movimientosInternos.findFirst({
      where: {
        idMovimiento: request.idOrigen,
        idTenant: activeUser.idTenant,
        idEmpresa: companyId,
        idTipoMovimiento: request.idTipoMovimiento,
      },
      include: {
        Empleados: {
          select: {
            idEmpleado: true,
            nombre: true,
            primerApellido: true,
            segundoApellido: true,
            idJefeInmediato: true,
            idPuesto: true,
            idSite: true,
          },
        },
        Empleados_MovimientosInternos_solicitadoPorIdEmpleadoToEmpleados: {
          select: {
            idEmpleado: true,
            nombre: true,
            primerApellido: true,
            segundoApellido: true,
          },
        },
        CatTipoMovimiento: true,
      },
    });

    if (!movimiento) {
      throw new NotFoundException('El movimiento interno no existe o no tienes permiso para consultarlo.');
    }

    if (soloPendientes && movimiento.estatus !== 'PENDIENTE') {
      throw new BadRequestException('Este movimiento interno ya no se encuentra pendiente de aprobación.');
    }

    const empleado = movimiento.Empleados;
    const nombreCompleto = [empleado?.nombre, empleado?.primerApellido, empleado?.segundoApellido].filter(Boolean).join(' ');
    const solicitante = movimiento.Empleados_MovimientosInternos_solicitadoPorIdEmpleadoToEmpleados;
    const solicitanteNombreCompleto = [solicitante?.nombre, solicitante?.primerApellido, solicitante?.segundoApellido].filter(Boolean).join(' ');

    const flujo = await this.construirFlujoMovimientoInterno(
      activeUser,
      companyId,
      movimiento,
      request
    );

    return {
      solicitud: {
        idOrigen: movimiento.idMovimiento,
        tipo: 'MOVIMIENTO_INTERNO',
        idEmpleado: empleado?.idEmpleado ?? movimiento.idEmpleado,
        empleadoNombreCompleto: nombreCompleto || 'Sin empleado',
        empleadoIniciales: obtenerIniciales(empleado?.nombre ?? '', empleado?.primerApellido ?? ''),
        tipoMovimientoNombre: movimiento.CatTipoMovimiento?.nombre ?? 'Movimiento interno',
        codigoTipoSolicitud: movimiento.CatTipoMovimiento?.codigo ?? 'MOVIMIENTO_INTERNO',
        estatus: movimiento.estatus,
        fechaRegistro: movimiento.fechaRegistro,
        fechaRespuesta: movimiento.fechaRespuesta,
        comentarios: movimiento.motivo ?? null,
        motivoRechazo: movimiento.motivoRechazo ?? null,
        solicitadoPorIdEmpleado: movimiento.solicitadoPorIdEmpleado,
        solicitanteNombreCompleto: solicitanteNombreCompleto || null,
        solicitante: solicitante ? {
          idEmpleado: solicitante.idEmpleado,
          nombre: solicitante.nombre,
          primerApellido: solicitante.primerApellido,
          segundoApellido: solicitante.segundoApellido,
        } : null,
        movimientoInterno: {
          idMovimiento: movimiento.idMovimiento,
          idTipoMovimiento: movimiento.idTipoMovimiento,
          fechaEfectiva: movimiento.fechaEfectiva,
          idPuestoAnterior: movimiento.idPuestoAnterior,
          idPuestoNuevo: movimiento.idPuestoNuevo,
          idAreaAnterior: movimiento.idAreaAnterior,
          idAreaNueva: movimiento.idAreaNueva,
          idJefeAnterior: movimiento.idJefeAnterior,
          idJefeNuevo: movimiento.idJefeNuevo,
          idEmpresaAnterior: movimiento.idEmpresaAnterior,
          idEmpresaNueva: movimiento.idEmpresaNueva,
          idSiteAnterior: movimiento.idSiteAnterior,
          idSiteNuevo: movimiento.idSiteNuevo,
          salarioBrutoAnterior: movimiento.salarioBrutoAnterior,
          salarioBrutoNuevo: movimiento.salarioBrutoNuevo,
          salarioNetoAnterior: movimiento.salarioNetoAnterior,
          salarioNetoNuevo: movimiento.salarioNetoNuevo,
          idTipoMoneda: movimiento.idTipoMoneda,
          idPeriodicidadPago: movimiento.idPeriodicidadPago,
          motivo: movimiento.motivo,
          causaBaja: movimiento.causaBaja,
          solicitadoPorIdEmpleado: movimiento.solicitadoPorIdEmpleado,
          solicitanteNombreCompleto: solicitanteNombreCompleto || null,
        },
      },
      flujo,
    };
  }

}
