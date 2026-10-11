import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateApprovalWorkflowBatchDto } from './dto/create-approval-workflow.dto';
import { PaginationApprovalWorkflowDto } from './dto/pagination-approval-workflow.dto';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class PersonnelConfigService {
  private readonly logger = new Logger(PersonnelConfigService.name);

  constructor(private readonly prisma: PrismaService) { }

  async obtenerTiposDeMovimientoPorModulo(idTenant: number, idCompany: number, idModulo: number,) {
    return this.prisma.catTipoMovimiento.findMany({
      where: {
        idModuloFlujo: idModulo,
        activo: true,
      },
    });
  }

  async guardarFlujoAprobacionCompleto(
    idTenant: number,
    idEmpresa: number,
    dto: CreateApprovalWorkflowBatchDto,
  ) {
    const { idModuloFlujo, idTipoMovimiento, pasos } = dto;

    if (!pasos || pasos.length === 0) {
      throw new BadRequestException('Debes enviar al menos un paso de aprobación.');
    }

    // 1. Obtener y validar el tipo de movimiento
    const tipoMovimiento = await this.prisma.catTipoMovimiento.findUnique({
      where: { idTipoMovimiento },
    });

    if (!tipoMovimiento) {
      throw new NotFoundException(
        `El tipo de movimiento con ID ${idTipoMovimiento} no existe.`,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 2. Limpiar flujo previo de este trámite en la empresa
        // Las relaciones en ConfiguracionPasoAreaDirector se eliminan por ON DELETE CASCADE
        await tx.configuracionFlujoPaso.deleteMany({
          where: {
            idEmpresa,
            idTipoMovimiento,
          },
        });

        const pasosCreados: any[] = [];

        // 3. Crear cada paso secuencialmente
        for (const pasoDto of pasos) {
          const pasoCreado = await tx.configuracionFlujoPaso.create({
            data: {
              idTenant,
              idEmpresa,
              idModuloFlujo,
              idTipoMovimiento,
              codigoTipoSolicitud: tipoMovimiento.codigo,
              paso: pasoDto.paso,
              tipoAprobador: pasoDto.tipoAprobador,
              nivelJerarquia:
                pasoDto.tipoAprobador === 'JERARQUIA'
                  ? pasoDto.nivelJerarquia ?? 1
                  : null,
              autoAprobarSiSolicitante:
                pasoDto.tipoAprobador === 'JERARQUIA'
                  ? pasoDto.autoAprobarSiSolicitante ?? true
                  : false,
              idRolAprobador:
                pasoDto.tipoAprobador === 'ROL'
                  ? pasoDto.idRolAprobador ?? null
                  : null,
              modoAsignacionRol:
                pasoDto.tipoAprobador === 'ROL'
                  ? pasoDto.modoAsignacionRol ?? 'CUALQUIERA'
                  : null,
              idUsuarioFijoRol:
                pasoDto.tipoAprobador === 'ROL' &&
                  pasoDto.modoAsignacionRol === 'ESPECIFICO'
                  ? pasoDto.idUsuarioFijoRol ?? null
                  : null,
              activo: true,
              // 4. Si el paso es AREA, insertar la matriz 1 a N
              ConfiguracionPasoAreaDirector:
                pasoDto.tipoAprobador === 'AREA' &&
                  pasoDto.directoresPorArea &&
                  pasoDto.directoresPorArea.length > 0
                  ? {
                    create: pasoDto.directoresPorArea.map((dir) => ({
                      idArea: dir.idArea,
                      idUsuarioDirector: dir.idUsuarioDirector,
                    })),
                  }
                  : undefined,
            },
            include: {
              ConfiguracionPasoAreaDirector: true,
            },
          });

          pasosCreados.push(pasoCreado);
        }

        this.logger.log(
          `Flujo guardado para Empresa: ${idEmpresa}, TipoMovimiento: ${tipoMovimiento.codigo} (${pasosCreados.length} pasos).`,
        );

        return {
          success: true,
          message: 'Flujo de aprobación guardado correctamente.',
          totalPasos: pasosCreados.length,
          data: pasosCreados,
        };
      });
    } catch (error) {
      this.logger.error(
        `Error al guardar el flujo de aprobaciones: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Ocurrió un error al persistir el flujo de aprobaciones.',
      );
    }
  }

  async obtenerFlujosDeAprobacionPaginados(
    idTenant: number,
    idEmpresa: number,
    query: PaginationApprovalWorkflowDto,
  ) {
    const { page = 1, limit = 10, search, idModuloFlujo } = query;
    const skip = (page - 1) * limit;

    // Condición WHERE base: empresa y tenant
    const whereCondition: Prisma.ConfiguracionFlujoPasoWhereInput = {
      idEmpresa,
      idTenant,
      activo: true,
      ...(idModuloFlujo ? { idModuloFlujo } : {}),
      ...(search
        ? {
          OR: [
            { codigoTipoSolicitud: { contains: search } },
            {
              // Si tienes la relación tipomovimiento en el schema de prisma:
              // CatTipoMovimiento: { nombre: { contains: search } }
            },
          ],
        }
        : {}),
    };

    // 1. Obtener la lista única de trámites configurados para la empresa (para paginar a nivel trámite)
    const tramitesAgrupados = await this.prisma.configuracionFlujoPaso.groupBy({
      by: ['idTipoMovimiento', 'idModuloFlujo', 'codigoTipoSolicitud'],
      where: whereCondition,
      _count: {
        idConfiguracionPaso: true,
      },
      skip,
      take: limit,
      orderBy: {
        idTipoMovimiento: 'asc',
      },
    });

    // 2. Conteo total de trámites configurados distintos
    const totalTramitesCount = await this.prisma.configuracionFlujoPaso.groupBy({
      by: ['idTipoMovimiento'],
      where: whereCondition,
    });
    const total = totalTramitesCount.length;
    const totalPages = Math.ceil(total / limit) || 1;

    if (tramitesAgrupados.length === 0) {
      return {
        data: [],
        meta: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      };
    }

    // 3. Extraer los IDs de movimientos de la página actual
    const tiposMovimientoIds = tramitesAgrupados.map((t) => t.idTipoMovimiento);

    // 4. Traer todos los pasos detallados de esos trámites
    const pasos = await this.prisma.configuracionFlujoPaso.findMany({
      where: {
        idEmpresa,
        idTenant,
        activo: true,
        idTipoMovimiento: { in: tiposMovimientoIds },
      },
      include: {
        ConfiguracionPasoAreaDirector: true,
      },
      orderBy: [
        { idTipoMovimiento: 'asc' },
        { paso: 'asc' },
      ],
    });

    // 5. Enriquecer con nombres de CatTipoMovimiento y CatModuloFlujo
    const tiposMovimientoCatalogo = await this.prisma.catTipoMovimiento.findMany({
      where: {
        idTipoMovimiento: { in: tiposMovimientoIds },
      },
      select: {
        idTipoMovimiento: true,
        nombre: true,
        codigo: true,
      },
    });

    const modulosCatalogo = await this.prisma.catModuloFlujo.findMany({
      select: {
        idModuloFlujo: true,
        nombre: true,
        codigo: true,
      },
    });

    const tiposMovMap = new Map(tiposMovimientoCatalogo.map((t) => [t.idTipoMovimiento, t]));
    const modulosMap = new Map(modulosCatalogo.map((m) => [m.idModuloFlujo, m]));

    // 6. Agrupar la respuesta por Trámite
    const data = tramitesAgrupados.map((item) => {
      const pasosDelTramite = pasos.filter(
        (p) => p.idTipoMovimiento === item.idTipoMovimiento,
      );

      const tipoInfo = tiposMovMap.get(item.idTipoMovimiento);
      const moduloInfo = modulosMap.get(item.idModuloFlujo);

      return {
        idTipoMovimiento: item.idTipoMovimiento,
        nombreTipoMovimiento: tipoInfo?.nombre || item.codigoTipoSolicitud,
        codigoTipoSolicitud: item.codigoTipoSolicitud,
        idModuloFlujo: item.idModuloFlujo,
        nombreModulo: moduloInfo?.nombre || (item.idModuloFlujo === 1 ? 'Incidencias' : 'Movimientos'),
        codigoModulo: moduloInfo?.codigo || (item.idModuloFlujo === 1 ? 'INCIDENCIAS' : 'MOVIMIENTOS'),
        totalPasos: pasosDelTramite.length,
        pasos: pasosDelTramite.map((p) => ({
          idConfiguracionPaso: p.idConfiguracionPaso,
          paso: p.paso,
          tipoAprobador: p.tipoAprobador,
          nivelJerarquia: p.nivelJerarquia,
          autoAprobarSiSolicitante: p.autoAprobarSiSolicitante,
          idRolAprobador: p.idRolAprobador,
          modoAsignacionRol: p.modoAsignacionRol,
          idUsuarioFijoRol: p.idUsuarioFijoRol,
          totalDirectoresArea: p.ConfiguracionPasoAreaDirector?.length || 0,
          directoresPorArea: p.ConfiguracionPasoAreaDirector || [],
        })),
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  // Este endpoint retorna el flujo de aprobacion por tipo de movimiento
  async obtenerFlujoPorTipoMovimiento(idTenant: number, idEmpresa: number, idTipoMovimiento: number) {
    // 1. Obtener los pasos con su matriz de áreas
    const pasos = await this.prisma.configuracionFlujoPaso.findMany({
      where: { idEmpresa, idTenant, idTipoMovimiento, activo: true },
      include: { ConfiguracionPasoAreaDirector: true },
      orderBy: { paso: 'asc' },
    });

    if (!pasos || pasos.length === 0) {
      throw new NotFoundException('No existe flujo configurado para este trámite.');
    }

    // 2. Traer catálogos para resolver nombres
    const [tipoMov, rolesCatalog, areasCatalog, usuariosCatalog] = await Promise.all([
      this.prisma.catTipoMovimiento.findUnique({
        where: { idTipoMovimiento },
        include: { CatModuloFlujo: true },
      }),
      this.prisma.catRoles.findMany({ where: { idTenant: idTenant }, select: { idRol: true, descripcion: true } }),
      this.prisma.catAreas.findMany({ where: { idTenant: idTenant }, select: { idArea: true, Descripcion: true } }), // O CatArea según tu schema
      this.prisma.auth_user.findMany({
        where: { idTenant: idTenant }, select: { id: true, first_name: true, last_name: true, username: true },
      }),
    ]);

    const rolesMap = new Map(rolesCatalog.map((r) => [r.idRol, r.descripcion]));
    const areasMap = new Map(areasCatalog.map((a: any) => [a.idArea, a.Descripcion || a.descripcion]));
    const usersMap = new Map(
      usuariosCatalog.map((u: any) => [
        u.id,
        `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
      ])
    );

    return {
      idTipoMovimiento,
      nombreTipoMovimiento: tipoMov?.nombre || pasos[0].codigoTipoSolicitud,
      codigoTipoSolicitud: pasos[0].codigoTipoSolicitud,
      idModuloFlujo: pasos[0].idModuloFlujo,
      nombreModulo: tipoMov?.CatModuloFlujo?.nombre || '',
      totalPasos: pasos.length,
      pasos: pasos.map((p) => ({
        idConfiguracionPaso: p.idConfiguracionPaso,
        paso: p.paso,
        tipoAprobador: p.tipoAprobador,
        nivelJerarquia: p.nivelJerarquia,
        autoAprobarSiSolicitante: p.autoAprobarSiSolicitante,
        idRolAprobador: p.idRolAprobador,
        nombreRol: p.idRolAprobador ? rolesMap.get(p.idRolAprobador) || `Rol #${p.idRolAprobador}` : null,
        modoAsignacionRol: p.modoAsignacionRol,
        idUsuarioFijoRol: p.idUsuarioFijoRol,
        nombreUsuarioFijo: p.idUsuarioFijoRol ? usersMap.get(p.idUsuarioFijoRol) || `Usuario #${p.idUsuarioFijoRol}` : null,
        directoresPorArea: (p.ConfiguracionPasoAreaDirector || []).map((dir) => ({
          idArea: dir.idArea,
          nombreArea: areasMap.get(dir.idArea) || `Área #${dir.idArea}`,
          idUsuarioDirector: dir.idUsuarioDirector,
          nombreUsuario: usersMap.get(dir.idUsuarioDirector) || `Director #${dir.idUsuarioDirector}`,
        })),
      })),
    };
  }
}