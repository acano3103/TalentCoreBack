import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreateInternalMovementDto } from './dto/create-internal-movement.dto';
import { NotificationDispatcher } from '../notifications/notification.dispatcher';
import { ApprovalsService } from '../approvals/approvals.service';
import { QueryInternalMovementsDto } from './dto/query-internal-movements.dto';
import { Prisma } from 'generated/prisma/client';
import { obtenerIniciales } from '../approvals/utils/approvals.utils';
import { ModuloOrigenEnum } from '../approvals/enums/approval-origin.enum';
import { GetInternalMovementRequestDetailDto } from './dto/get-internal-movement-request.detail.dto';
import { CreateStaffReductionMovementDto } from './dto/create-staff-reduction-movement.dto';
import { MediaPathService } from 'src/common/services/media-path.service';

@Injectable()
export class InternalMovementsService {
  constructor(
    private prisma: PrismaService,
    private readonly mediaPathService: MediaPathService,
    private readonly approvalsService: ApprovalsService,
  ) { }

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



  async createStaffReductionMovement(
    activeUser: ActiveUserDto,
    companyId: number,
    dto: CreateStaffReductionMovementDto,
    archivos: Express.Multer.File[],
  ) {
    const employeeId = dto.employeeId;
    const metadata = dto.archivosMetadata ?? [];
    const TIPO_MOVIMIENTO_BAJA = 'Baja de Personal';

    if (!archivos?.length) {
      throw new BadRequestException(
        'Debes adjuntar al menos un archivo para solicitar la baja.',
      );
    }

    if (!Array.isArray(metadata) || metadata.length !== archivos.length) {
      throw new BadRequestException(
        'La metadata de los archivos no coincide con los documentos recibidos.',
      );
    }

    // Validar índices únicos y correspondencia con los archivos.
    const indices = new Set<number>();

    for (const item of metadata) {
      if (
        !Number.isInteger(item.indice) ||
        item.indice < 0 ||
        item.indice >= archivos.length ||
        indices.has(item.indice)
      ) {
        throw new BadRequestException(
          'La metadata contiene índices de archivo inválidos o duplicados.',
        );
      }

      indices.add(item.indice);

      const archivo = archivos[item.indice];

      if (!archivo?.buffer) {
        throw new BadRequestException(
          `El archivo ${item.nombreArchivo} no contiene datos.`,
        );
      }

      const nombreMetadata = this.normalizarNombreArchivo(item.nombreArchivo);
      const nombreArchivo = this.normalizarNombreArchivo(archivo.originalname);

      if (
        nombreMetadata !== nombreArchivo ||
        Number(item.tamano) !== Number(archivo.size) ||
        item.tipo !== archivo.mimetype
      ) {
        throw new BadRequestException(
          `La metadata no coincide con el archivo ${item.nombreArchivo}.`,
        );
      }
    }

    const solicitante = await this.prisma.empleados.findFirst({
      where: {
        idUsuario: activeUser.uuid,
        idEmpresa: companyId,
        idTenant: activeUser.idTenant,
        activo: true,
      },
      select: {
        idEmpleado: true,
      },
    });

    if (!solicitante) {
      throw new NotFoundException(
        'El usuario en sesión no cuenta con un empleado activo en esta empresa.',
      );
    }

    const tipoMovimiento = await this.prisma.catTipoMovimiento.findFirst({
      where: {
        nombre: TIPO_MOVIMIENTO_BAJA,
        idModuloFlujo: 2,
        activo: true,
      },
    });

    if (!tipoMovimiento) {
      throw new BadRequestException(
        `El tipo de movimiento "${TIPO_MOVIMIENTO_BAJA}" no existe, está inactivo o no pertenece al módulo de movimientos internos.`,
      );
    }

    // Se usa para limpiar archivos físicos si falla el registro en BD.
    const rutasArchivosGuardados: string[] = [];

    let movimiento: { idMovimiento: number };

    try {
      movimiento = await this.prisma.$transaction(async (tx) => {
        const empleadoActual = await tx.empleados.findFirst({
          where: {
            idEmpleado: employeeId,
            idEmpresa: companyId,
            idTenant: activeUser.idTenant,
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

        const salarioActual = await tx.historialSalarios.findFirst({
          where: {
            idEmpleado: employeeId,
            actual: true,
          },
        });

        // La baja conserva los datos laborales actuales como referencia.
        const nuevaSolicitud = await tx.movimientosInternos.create({
          data: {
            idTenant: activeUser.idTenant,
            idEmpresa: companyId,
            idEmpleado: employeeId,
            idTipoMovimiento: tipoMovimiento.idTipoMovimiento,
            solicitadoPorIdEmpleado: solicitante.idEmpleado,
            fechaEfectiva: null,
            idPuestoAnterior: empleadoActual.idPuesto,
            idPuestoNuevo: empleadoActual.idPuesto,
            idAreaAnterior: empleadoActual.CatPuestos?.idArea ?? null,
            idAreaNueva: empleadoActual.CatPuestos?.idArea ?? null,
            idJefeAnterior: empleadoActual.idJefeInmediato,
            idJefeNuevo: empleadoActual.idJefeInmediato,
            idEmpresaAnterior: empleadoActual.idEmpresa,
            idEmpresaNueva: empleadoActual.idEmpresa,
            idSiteAnterior: empleadoActual.idSite,
            idSiteNuevo: empleadoActual.idSite,
            salarioBrutoAnterior: salarioActual?.salarioBruto ?? null,
            salarioBrutoNuevo: salarioActual?.salarioBruto ?? null,
            salarioNetoAnterior: salarioActual?.salarioNeto ?? null,
            salarioNetoNuevo: salarioActual?.salarioNeto ?? null,
            idTipoMoneda: salarioActual?.idTipoMoneda ?? null,
            idPeriodicidadPago: salarioActual?.idPeriodicidadPago ?? null,
            motivo: dto.motivo,
            causaBaja: dto.causaBaja,
            estatus: 'PENDIENTE',
            pasoActual: 1,
            totalPasos: 1,
            idAprobador: null,
            fechaRespuesta: null,
            motivoRechazo: null,
            idUsuarioAutorizo: null,
            idPlanCarrera: null,
          },
        });

        // Detalles dinámicos de la baja: fechas, causal, tipo de contrato, etc.
        await tx.detalleBajasPersonal.create({
          data: {
            idMovimiento: nuevaSolicitud.idMovimiento,
            datosBaja: (dto.bajaDatos ?? {}) as any,
          },
        });

        // Guardar archivos físicos y registrar sus rutas.
        // El índice de metadata identifica el archivo recibido por Multer.
        for (const item of metadata) {
          const archivo = archivos[item.indice];

          const archivoGuardado = await this.mediaPathService.saveFile(
            archivo,
            {
              idTenant: activeUser.idTenant,
              subfolder:
                `solicitudes/movimientos-internos/bajas/${nuevaSolicitud.idMovimiento}`,
            },
          );

          rutasArchivosGuardados.push(archivoGuardado.rutaRelativa);

          await tx.archivosSolicitudes.create({
            data: {
              idTenant: activeUser.idTenant,
              idEmpresa: companyId,
              idEmpleado: employeeId,
              moduloSolicitud: 'MOVIMIENTOS_INTERNOS',
              idSolicitud: nuevaSolicitud.idMovimiento,
              nombreOriginal: archivoGuardado.nombreOriginal,
              nombreAlmacenado: archivoGuardado.nombreAlmacenado,
              rutaRelativa: archivoGuardado.rutaRelativa,
              mimeType: archivoGuardado.mimeType,
              tamanoBytes: BigInt(archivoGuardado.tamanoBytes),
              usuarioRegistro: activeUser.uuid,
            },
          });
        }

        await tx.historicoMovimientos.create({
          data: {
            idUsuario: activeUser.id,
            idEmpresa: companyId,
            accion: 'SOLICITUD_MOVIMIENTO',
            tablaOrigen: 'MovimientosInternos',
            idRegistro: String(nuevaSolicitud.idMovimiento),
            descripcion:
              `${activeUser.first_name} ${activeUser.last_name} solicitó ` +
              `la baja del empleado ${employeeId}. Causa: ${dto.causaBaja}.`,
            fechaCreacion: new Date(),
          },
        });

        return nuevaSolicitud;
      });
    } catch (error) {
      // La BD revierte la transacción, pero los archivos físicos no.
      await Promise.allSettled(
        rutasArchivosGuardados.map((ruta) =>
          this.mediaPathService.deleteFile(ruta),
        ),
      );

      throw error;
    }

    // Ejecutar el motor existente de aprobación.
    const resultadoAprobacion =
      await this.approvalsService.aprobarAutomaticamenteSinFlujoAprobacion(
        activeUser.idTenant,
        companyId,
        tipoMovimiento.idTipoMovimiento,
        movimiento.idMovimiento,
        'MOVIMIENTO_INTERNO',
      );

    const aprobadaAutomaticamente = resultadoAprobacion === 'Solicitud aprobada automaticamente por falta de flujo de aprobación.';

    // Solo aplicar si el motor confirmó la aprobación automática.
    if (aprobadaAutomaticamente) {
      await this.aplicarMovimientoAEmpleado(movimiento.idMovimiento, activeUser);
    }

    return {
      message: aprobadaAutomaticamente
        ? 'Solicitud de baja aprobada automáticamente y aplicada al empleado.'
        : 'Solicitud de baja registrada y enviada al flujo de aprobación.',
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

      if (movimiento.causaBaja != null) {
        const empleado = await tx.empleados.findFirst({
          where: {
            idEmpleado: movimiento.idEmpleado,
            idTenant: movimiento.idTenant,
            idEmpresa: movimiento.idEmpresa,
            activo: true,
          },
        });

        if (!empleado) {
          throw new NotFoundException(
            `No se encontró el empleado ${movimiento.idEmpleado} activo para aplicar la baja.`,
          );
        }

        const empleadoDesactivado = await tx.empleados.update({
          where: {
            idEmpleado: empleado.idEmpleado,
          },
          data: {
            activo: false,
          },
        });

        await tx.historicoMovimientos.create({
          data: {
            idUsuario: user?.id || 0,
            idEmpresa: movimiento.idEmpresa,
            accion: 'APLICACION_MOVIMIENTO',
            tablaOrigen: 'MovimientosInternos',
            idRegistro: String(movimiento.idMovimiento),
            descripcion:
              `Se aplicó la baja del empleado ${movimiento.idEmpleado}. ` +
              `Causa: ${movimiento.causaBaja}.`,
            fechaCreacion: new Date(),
          },
        });

        return {
          message: 'Baja aplicada correctamente al empleado.',
          data: {
            movimiento,
            empleado: empleadoDesactivado,
          },
        };
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
        DetalleBajasPersonal: {
          select: {
            idDetalleBaja: true,
            idMovimiento: true,
            datosBaja: true,
            fechaRegistro: true,
          },
        },
      },
    });

    if (!movimiento) {
      throw new NotFoundException('El movimiento interno no existe o no tienes permiso para consultarlo.');
    }

    if (soloPendientes && movimiento.estatus !== 'PENDIENTE') {
      throw new BadRequestException('Este movimiento interno ya no se encuentra pendiente de aprobación.');
    }

    const archivos = await this.prisma.archivosSolicitudes.findMany({
      where: {
        idTenant: activeUser.idTenant,
        idEmpresa: companyId,
        idEmpleado: movimiento.idEmpleado,
        moduloSolicitud: 'MOVIMIENTOS_INTERNOS',
        idSolicitud: movimiento.idMovimiento,
      },
      select: {
        idArchivoSolicitud: true,
        idEmpleado: true,
        moduloSolicitud: true,
        idSolicitud: true,
        nombreOriginal: true,
        nombreAlmacenado: true,
        rutaRelativa: true,
        mimeType: true,
        tamanoBytes: true,
        usuarioRegistro: true,
        fechaRegistro: true,
      },
      orderBy: {
        fechaRegistro: 'asc',
      },
    });

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
          detalleBaja: movimiento.DetalleBajasPersonal
            ? {
              idDetalleBaja: movimiento.DetalleBajasPersonal.idDetalleBaja,
              idMovimiento: movimiento.DetalleBajasPersonal.idMovimiento,
              datosBaja: movimiento.DetalleBajasPersonal.datosBaja,
              fechaRegistro: movimiento.DetalleBajasPersonal.fechaRegistro,
            }
            : null,
          archivos: archivos.map((archivo) => ({
            idArchivoSolicitud: archivo.idArchivoSolicitud,
            idEmpleado: archivo.idEmpleado,
            moduloSolicitud: archivo.moduloSolicitud,
            idSolicitud: archivo.idSolicitud,
            nombreOriginal: archivo.nombreOriginal,
            nombreAlmacenado: archivo.nombreAlmacenado,
            rutaRelativa: archivo.rutaRelativa,
            mimeType: archivo.mimeType,
            tamanoBytes: archivo.tamanoBytes.toString(),
            usuarioRegistro: archivo.usuarioRegistro,
            fechaRegistro: archivo.fechaRegistro,
          })),
        },
      },

      flujo,
    };
  }

  private normalizarNombreArchivo(nombre: string): string {
    const normalizado = nombre.normalize('NFC');

    // Detecta mojibake típico de UTF-8 interpretado como Latin-1
    if (/[ÃÂÌÐÑ]/.test(normalizado)) {
      return Buffer.from(normalizado, 'latin1')
        .toString('utf8')
        .normalize('NFC');
    }

    return normalizado;
  }

}
