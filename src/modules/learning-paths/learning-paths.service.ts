import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from 'generated/prisma/client';
import {
  COMMS_EVENTO_CURSO,
  HechoCurso,
  emitirHecho,
} from 'src/common/events/comms-hechos';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { AssignmentEngineService } from './engine/assignment-engine.service';
import { RutaMotorService } from './engine/ruta-motor.service';
import { AvisoMotor } from './engine/ruta-avisos';
import { RutaAvisosService } from './engine/ruta-avisos.service';
import { diaAlmacenado, hoyNegocio } from './engine/impacto';
import { errorRuta } from './learning-paths.errores';
import {
  ActualizarRutaDto,
  AlcanceVersionDto,
  CrearRutaDto,
  EtapaVersionDto,
  ListarRutasQuery,
  PaginacionQuery,
  ReemplazarVersionDto,
} from './dto/rutas.dto';
import {
  ReglaVisible,
  alcanceToca,
  resumenAlcance,
} from './scope/resolver.service';
import { exigirModulo } from './permiso-modulo';

const ESTATUS_ASIGNACION = ['activa', 'completada', 'por_aprobar'] as const;
type Cliente = Prisma.TransactionClient;

interface ElementoEscritura {
  idCurso: number;
  orden: number;
  obligatorio: boolean;
  idCursoPrerrequisito: number | null;
  vigenciaMeses: number | null;
}

interface EtapaEscritura {
  nombre: string;
  orden: number;
  diaInicio: number;
  diaFin: number;
  requiereEtapaAnterior: boolean;
  elementos: ElementoEscritura[];
}

interface AlcanceEscritura {
  modo: 'incluir' | 'excluir';
  idUnidadOperativa: number | null;
  estado: string | null;
  idSite: number | null;
  idPuesto: number | null;
  idArea: number | null;
}

@Injectable()
export class LearningPathsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly motor: RutaMotorService,
    @Optional() private readonly asignacion?: AssignmentEngineService,
    @Optional() @Inject(EventEmitter2) private readonly eventos?: EventEmitter2,
    @Optional()
    @Inject(RutaAvisosService)
    private readonly avisos?: RutaAvisosService,
  ) {}

  async listar(companyId: number, query: ListarRutasQuery) {
    const { page, limit, skip } = paginar(query.page, query.limit);
    const busqueda = query.search?.trim();
    const rutas = await this.prisma.rutaAprendizaje.findMany({
      where: {
        idEmpresa: companyId,
        ...(query.proposito ? { proposito: query.proposito } : {}),
        ...(busqueda ? { nombre: { contains: busqueda } } : {}),
      },
      orderBy: { fechaRegistro: 'desc' },
      include: {
        RutaVersiones: {
          where: { estado: { in: ['borrador', 'publicada'] } },
          include: {
            RutaEtapas: {
              select: { RutaElementos: { select: { idElemento: true } } },
            },
            RutaAlcances: {
              include: {
                CatSites: { select: { Descripcion: true } },
                CatPuestos: { select: { NombrePuesto: true } },
                CatAreas: { select: { Descripcion: true } },
                CatUnidadesOperativas: { select: { Nombre: true } },
              },
            },
          },
        },
      },
    });

    const conAlcance = rutas.filter((ruta) => {
      const actual = versionActual(ruta.RutaVersiones);
      return alcanceToca(actual?.RutaAlcances ?? [], {
        idSite: query.idSite,
        idPuesto: query.idPuesto,
      });
    });
    const stats = await this.estadisticas(
      conAlcance.map((ruta) => ruta.idRutaAprendizaje),
    );
    const visibles = query.estado
      ? conAlcance.filter(
          (ruta) => estadoDe(ruta.RutaVersiones) === query.estado,
        )
      : conAlcance;
    const items = visibles
      .slice(skip, skip + limit)
      .map((ruta) =>
        this.fila(ruta, stats.porRuta.get(ruta.idRutaAprendizaje)),
      );

    return {
      items,
      total: visibles.length,
      page,
      limit,
      totalPages: Math.ceil(visibles.length / limit) || 1,
      kpis: stats.kpis,
    };
  }

  async crear(user: ActiveUserDto, companyId: number, dto: CrearRutaDto) {
    const id = await this.prisma.$transaction(async (tx) => {
      const ruta = await tx.rutaAprendizaje.create({
        data: {
          idTenant: user.idTenant,
          idEmpresa: companyId,
          nombre: dto.nombre.trim(),
          descripcion: dto.descripcion?.trim() || null,
          proposito: dto.proposito,
          activo: true,
          usuarioRegistro: user.uuid,
        },
      });
      await tx.rutaVersion.create({
        data: {
          idRutaAprendizaje: ruta.idRutaAprendizaje,
          numero: 1,
          estado: 'borrador',
        },
      });
      await tx.historicoMovimientos.create({
        data: bitacora(
          user,
          companyId,
          'CREAR',
          ruta.idRutaAprendizaje,
          `creó la ruta ${ruta.nombre}.`,
        ),
      });
      return ruta.idRutaAprendizaje;
    });
    return this.detalle(companyId, id);
  }

  async detalle(companyId: number, id: number) {
    const ruta = await this.prisma.rutaAprendizaje.findFirst({
      where: { idRutaAprendizaje: id, idEmpresa: companyId },
      include: {
        RutaVersiones: {
          where: { estado: { in: ['borrador', 'publicada'] } },
          include: includeVersion(),
        },
      },
    });
    if (!ruta)
      throw new NotFoundException('La ruta no existe en esta empresa.');
    const publicada =
      ruta.RutaVersiones.find((version) => version.estado === 'publicada') ??
      null;
    const borrador =
      ruta.RutaVersiones.find((version) => version.estado === 'borrador') ??
      null;
    return {
      idRutaAprendizaje: ruta.idRutaAprendizaje,
      nombre: ruta.nombre,
      descripcion: ruta.descripcion,
      proposito: ruta.proposito,
      activo: ruta.activo,
      fechaRegistro: ruta.fechaRegistro,
      versionPublicada: publicada ? mapearVersion(publicada) : null,
      versionBorrador: borrador ? mapearVersion(borrador) : null,
      disparadores: disparadoresDeRuta(publicada != null || borrador != null),
    };
  }

  async actualizar(
    user: ActiveUserDto,
    companyId: number,
    id: number,
    dto: ActualizarRutaDto,
  ) {
    const ruta = await this.exigirRuta(companyId, id);
    const data: Prisma.RutaAprendizajeUpdateInput = {};
    if (dto.nombre !== undefined) data.nombre = dto.nombre.trim();
    if (dto.descripcion !== undefined)
      data.descripcion = dto.descripcion?.trim() || null;
    if (dto.proposito !== undefined) data.proposito = dto.proposito;
    if (dto.activo !== undefined) data.activo = dto.activo;
    if (Object.keys(data).length === 0) {
      throw errorRuta(
        HttpStatus.BAD_REQUEST,
        'SIN_CAMBIOS',
        'Indica al menos un dato para actualizar.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rutaAprendizaje.update({
        where: { idRutaAprendizaje: id },
        data,
      });
      if (dto.activo === false && ruta.activo) {
        await tx.historicoMovimientos.create({
          data: bitacora(
            user,
            companyId,
            'DESACTIVAR',
            id,
            `desactivó la ruta ${ruta.nombre}.`,
          ),
        });
      }
    });
    return this.detalle(companyId, id);
  }

  async crearBorrador(companyId: number, id: number) {
    await this.exigirRuta(companyId, id);
    const existente = await this.prisma.rutaVersion.findFirst({
      where: { idRutaAprendizaje: id, estado: 'borrador' },
      select: { idVersion: true },
    });
    if (existente) return this.detalle(companyId, id);

    const publicada = await this.prisma.rutaVersion.findFirst({
      where: { idRutaAprendizaje: id, estado: 'publicada' },
      include: {
        RutaEtapas: { include: { RutaElementos: true } },
        RutaAlcances: true,
      },
    });
    if (!publicada) {
      throw errorRuta(
        HttpStatus.CONFLICT,
        'SIN_VERSION_PUBLICADA',
        'No hay una versión publicada para copiar.',
      );
    }

    const numero = await this.siguienteNumero(id);
    await this.prisma.$transaction(async (tx) => {
      const borrador = await tx.rutaVersion.create({
        data: {
          idRutaAprendizaje: id,
          numero,
          estado: 'borrador',
          basadaEnVersion: publicada.idVersion,
        },
      });
      await escribirEstructura(
        tx,
        borrador.idVersion,
        estructuraDe(publicada),
        alcanceDe(publicada),
      );
    });
    return this.detalle(companyId, id);
  }

  async reemplazarVersion(
    companyId: number,
    id: number,
    idVersion: number,
    dto: ReemplazarVersionDto,
  ) {
    const version = await this.exigirVersion(companyId, id, idVersion);
    if (version.estado !== 'borrador') {
      throw errorRuta(
        HttpStatus.CONFLICT,
        'VERSION_NO_BORRADOR',
        'Solo se puede editar una versión en borrador.',
      );
    }
    const etapas = normalizarEtapas(dto.etapas);
    const alcance = normalizarAlcance(dto.alcance);
    await this.validarEstructura(companyId, etapas, alcance);

    try {
      await this.prisma.$transaction(async (tx) => {
        const sigue = await tx.rutaVersion.findFirst({
          where: { idVersion, idRutaAprendizaje: id, estado: 'borrador' },
          select: { idVersion: true },
        });
        if (!sigue)
          throw errorRuta(
            HttpStatus.CONFLICT,
            'VERSION_NO_BORRADOR',
            'Solo se puede editar una versión en borrador.',
          );
        await tx.rutaElemento.updateMany({
          where: { idVersion },
          data: { idElementoPrerrequisito: null },
        });
        await tx.rutaElemento.deleteMany({ where: { idVersion } });
        await tx.rutaEtapa.deleteMany({ where: { idVersion } });
        await tx.rutaAlcance.deleteMany({ where: { idVersion } });
        await escribirEstructura(tx, idVersion, etapas, alcance);
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (esPrisma(error, 'P2003')) {
        throw errorRuta(
          HttpStatus.CONFLICT,
          'VERSION_EN_USO',
          'El borrador ya tiene asignaciones y no se puede reemplazar.',
        );
      }
      throw error;
    }
    return this.detalle(companyId, id);
  }

  async vistaPrevia(companyId: number, id: number, idVersion: number) {
    await this.exigirVersion(companyId, id, idVersion);
    return this.motor.simular({ idEmpresa: companyId, idRuta: id, idVersion });
  }

  async publicar(
    user: ActiveUserDto,
    companyId: number,
    id: number,
    idVersion: number,
  ) {
    const version = await this.exigirVersion(companyId, id, idVersion);
    if (version.estado !== 'borrador') {
      throw errorRuta(
        HttpStatus.CONFLICT,
        'VERSION_NO_BORRADOR',
        'Solo se puede publicar una versión en borrador.',
      );
    }
    const cursos = await this.prisma.rutaElemento.count({
      where: { idVersion },
    });
    if (cursos === 0) {
      throw errorRuta(
        HttpStatus.BAD_REQUEST,
        'RUTA_SIN_CURSOS',
        'La ruta no tiene cursos para publicar.',
      );
    }

    const hechos: HechoCurso[] = [];
    const avisos: AvisoMotor[] = [];
    try {
      const resumen = await this.prisma.$transaction(async (tx) => {
        await tx.rutaVersion.updateMany({
          where: { idRutaAprendizaje: id, estado: 'publicada' },
          data: { estado: 'retirada' },
        });
        const publicada = await tx.rutaVersion.updateMany({
          where: { idVersion, idRutaAprendizaje: id, estado: 'borrador' },
          data: {
            estado: 'publicada',
            publicadaEn: new Date(),
            publicadaPor: user.uuid,
          },
        });
        if (publicada.count !== 1) {
          throw errorRuta(
            HttpStatus.CONFLICT,
            'VERSION_NO_BORRADOR',
            'Solo se puede publicar una versión en borrador.',
          );
        }
        const resultado = await this.motor.ejecutar(tx, {
          idEmpresa: companyId,
          idTenant: version.RutaAprendizaje.idTenant,
          idRuta: id,
          idVersion,
          publicadoPor: user.uuid,
          nombreRuta: version.RutaAprendizaje.nombre,
          disparador: 'publicacion',
        });
        hechos.push(...(resultado.hechos ?? []));
        avisos.push(...(resultado.avisos ?? []));
        await tx.historicoMovimientos.create({
          data: bitacora(
            user,
            companyId,
            'PUBLICAR',
            id,
            `publicó la versión ${version.numero} de la ruta ${version.RutaAprendizaje.nombre}.`,
          ),
        });
        return {
          grupos: resultado.grupos,
          modo: resultado.modo,
          idLote: resultado.idLote,
        };
      });
      for (const hecho of hechos) {
        emitirHecho(this.eventos, COMMS_EVENTO_CURSO, hecho);
      }
      await this.avisos?.despachar(avisos);
      return resumen;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (esPrisma(error, 'P2002')) {
        throw errorRuta(
          HttpStatus.CONFLICT,
          'VERSION_NO_BORRADOR',
          'Ya hay otra versión publicada o en borrador.',
        );
      }
      throw error;
    }
  }

  async asignar(
    user: ActiveUserDto,
    companyId: number,
    id: number,
    idEmpleados: number[],
  ) {
    await exigirModulo(this.prisma, user, 'learning-paths', 'editar');
    const ruta = await this.exigirRuta(companyId, id);
    const publicada = await this.prisma.rutaVersion.findFirst({
      where: { idRutaAprendizaje: id, estado: 'publicada' },
    });
    if (!publicada) {
      throw errorRuta(
        HttpStatus.CONFLICT,
        'SIN_VERSION_PUBLICADA',
        'La ruta no tiene una versión publicada.',
      );
    }
    if (!this.asignacion) {
      throw new InternalServerErrorException(
        'El motor de asignación no está disponible.',
      );
    }
    const resumen = await this.asignacion.asignar({
      idEmpresa: companyId,
      idTenant: ruta.idTenant,
      idEmpleados,
      idVersion: publicada.idVersion,
      disparador: 'manual',
      creadoPor: user.uuid,
    });
    await this.prisma.historicoMovimientos.create({
      data: bitacora(
        user,
        companyId,
        'ASIGNAR',
        id,
        `asignó la ruta ${ruta.nombre} a ${idEmpleados.length} personas.`,
      ),
    });
    return resumen;
  }

  async versiones(companyId: number, id: number) {
    await this.exigirRuta(companyId, id);
    const versiones = await this.prisma.rutaVersion.findMany({
      where: { idRutaAprendizaje: id },
      orderBy: { numero: 'desc' },
    });
    const uuids = versiones
      .map((version) => version.publicadaPor)
      .filter((uuid): uuid is string => !!uuid);
    const autoresVacios: {
      uuid: string;
      first_name: string;
      last_name: string;
    }[] = [];
    const [conteos, autores] = await Promise.all([
      this.prisma.rutaAsignacion.groupBy({
        by: ['idVersion'],
        where: {
          idRutaAprendizaje: id,
          estatus: { in: [...ESTATUS_ASIGNACION] },
        },
        _count: { _all: true },
      }),
      uuids.length
        ? this.prisma.auth_user.findMany({
            where: { uuid: { in: uuids } },
            select: { uuid: true, first_name: true, last_name: true },
          })
        : autoresVacios,
    ]);
    const asignados = new Map(
      conteos.map((fila) => [fila.idVersion, fila._count._all]),
    );
    const nombres = new Map(
      autores.map((autor) => [
        autor.uuid,
        `${autor.first_name} ${autor.last_name}`.trim(),
      ]),
    );
    return {
      versiones: versiones.map((version) => ({
        idVersion: version.idVersion,
        numero: version.numero,
        estado: version.estado,
        fecha: version.publicadaEn,
        autor: version.publicadaPor
          ? (nombres.get(version.publicadaPor) ?? version.publicadaPor)
          : null,
        asignados: asignados.get(version.idVersion) ?? 0,
        basadaEnVersion: version.basadaEnVersion,
      })),
    };
  }

  async asignados(companyId: number, id: number, query: PaginacionQuery) {
    await this.exigirRuta(companyId, id);
    const { page, limit, skip } = paginar(query.page, query.limit);
    const where = {
      idEmpresa: companyId,
      idRutaAprendizaje: id,
      estatus: { notIn: ['cancelada' as const, 'sustituida' as const] },
    };
    const [total, filas] = await Promise.all([
      this.prisma.rutaAsignacion.count({ where }),
      this.prisma.rutaAsignacion.findMany({
        where,
        include: {
          Empleados: {
            select: {
              nombre: true,
              primerApellido: true,
              segundoApellido: true,
              numeroEmpleado: true,
            },
          },
          RutaVersion: { select: { numero: true, estado: true } },
          Cursos: { select: { estado: true, venceVigencia: true } },
        },
        orderBy: { fechaAsignacion: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    const hoy = hoyNegocio();
    return {
      items: filas.map((fila) => {
        const completados = fila.Cursos.filter(
          (curso) =>
            (curso.estado === 'completado' || curso.estado === 'reconocido') &&
            (!curso.venceVigencia || diaAlmacenado(curso.venceVigencia) >= hoy),
        ).length;
        const cursos = fila.Cursos.length;
        return {
          idAsignacion: fila.idAsignacion,
          idEmpleado: fila.idEmpleado,
          nombre: nombrePersona(fila.Empleados),
          numeroEmpleado: fila.Empleados.numeroEmpleado,
          idVersion: fila.idVersion,
          numeroVersion: fila.RutaVersion.numero,
          estadoVersion: fila.RutaVersion.estado,
          estatus: fila.estatus,
          avance: {
            completados,
            total: cursos,
            porcentaje:
              cursos === 0 ? 0 : Math.round((completados / cursos) * 100),
          },
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async duplicar(user: ActiveUserDto, companyId: number, id: number) {
    const ruta = await this.exigirRuta(companyId, id);
    const versiones = await this.prisma.rutaVersion.findMany({
      where: {
        idRutaAprendizaje: id,
        estado: { in: ['publicada', 'borrador'] },
      },
      include: {
        RutaEtapas: { include: { RutaElementos: true } },
        RutaAlcances: true,
      },
    });
    const origen =
      versiones.find((version) => version.estado === 'publicada') ??
      versiones.find((version) => version.estado === 'borrador');
    const copia = await this.prisma.$transaction(async (tx) => {
      const nueva = await tx.rutaAprendizaje.create({
        data: {
          idTenant: user.idTenant,
          idEmpresa: companyId,
          nombre: nombreCopia(ruta.nombre),
          descripcion: ruta.descripcion,
          proposito: ruta.proposito,
          activo: true,
          usuarioRegistro: user.uuid,
        },
      });
      const version = await tx.rutaVersion.create({
        data: {
          idRutaAprendizaje: nueva.idRutaAprendizaje,
          numero: 1,
          estado: 'borrador',
        },
      });
      if (origen)
        await escribirEstructura(
          tx,
          version.idVersion,
          estructuraDe(origen),
          alcanceDe(origen),
        );
      await tx.historicoMovimientos.create({
        data: bitacora(
          user,
          companyId,
          'DUPLICAR',
          nueva.idRutaAprendizaje,
          `duplicó la ruta ${ruta.nombre}.`,
        ),
      });
      return nueva.idRutaAprendizaje;
    });
    return this.detalle(companyId, copia);
  }

  async opcionesAlcance(companyId: number) {
    const [unidades, sites, puestos, areas] = await Promise.all([
      this.prisma.catUnidadesOperativas.findMany({
        where: { idEmpresa: companyId, Activo: { not: false } },
        select: { idUnidadOperativa: true, Nombre: true },
        orderBy: { Nombre: 'asc' },
      }),
      this.prisma.catSites.findMany({
        where: { idEmpresa: companyId },
        select: {
          idSite: true,
          Descripcion: true,
          Estado: true,
          idUnidadOperativa: true,
          Activo: true,
        },
        orderBy: { Descripcion: 'asc' },
      }),
      this.prisma.catPuestos.findMany({
        where: { idEmpresa: companyId, Activo: true },
        select: { idPuesto: true, NombrePuesto: true, idArea: true },
        orderBy: { NombrePuesto: 'asc' },
      }),
      this.prisma.catAreas.findMany({
        where: { idEmpresa: companyId, Activo: { not: false } },
        select: { idArea: true, Descripcion: true },
        orderBy: { Descripcion: 'asc' },
      }),
    ]);
    const estados = [
      ...new Set(
        sites
          .map((site) => site.Estado?.trim())
          .filter((estado): estado is string => !!estado),
      ),
    ].sort((a, b) => a.localeCompare(b, 'es'));
    return {
      unidadesOperativas: unidades.map((unidad) => ({
        idUnidadOperativa: unidad.idUnidadOperativa,
        nombre: unidad.Nombre,
      })),
      estados,
      sites: sites
        .filter((site) => site.Activo !== false)
        .map((site) => ({
          idSite: site.idSite,
          nombre: site.Descripcion,
          estado: site.Estado,
          idUnidadOperativa: site.idUnidadOperativa,
        })),
      puestos: puestos.map((puesto) => ({
        idPuesto: puesto.idPuesto,
        nombre: puesto.NombrePuesto,
        idArea: puesto.idArea,
      })),
      areas: areas.map((area) => ({
        idArea: area.idArea,
        nombre: area.Descripcion,
      })),
    };
  }

  private async exigirRuta(companyId: number, id: number) {
    const ruta = await this.prisma.rutaAprendizaje.findFirst({
      where: { idRutaAprendizaje: id, idEmpresa: companyId },
    });
    if (!ruta)
      throw new NotFoundException('La ruta no existe en esta empresa.');
    return ruta;
  }

  private async exigirVersion(
    companyId: number,
    id: number,
    idVersion: number,
  ) {
    const version = await this.prisma.rutaVersion.findFirst({
      where: {
        idVersion,
        idRutaAprendizaje: id,
        RutaAprendizaje: { idEmpresa: companyId },
      },
      include: {
        RutaAprendizaje: { select: { nombre: true, idTenant: true } },
      },
    });
    if (!version)
      throw new NotFoundException('La versión no existe en esta ruta.');
    return version;
  }

  private async siguienteNumero(idRuta: number) {
    const ultima = await this.prisma.rutaVersion.aggregate({
      where: { idRutaAprendizaje: idRuta },
      _max: { numero: true },
    });
    return (ultima._max.numero ?? 0) + 1;
  }

  private async validarEstructura(
    companyId: number,
    etapas: EtapaEscritura[],
    alcance: AlcanceEscritura[],
  ) {
    for (const etapa of etapas) {
      if (etapa.diaInicio > etapa.diaFin) {
        throw errorRuta(
          HttpStatus.BAD_REQUEST,
          'PLAZO_INVALIDO',
          'El día de inicio no puede ser posterior al día de fin.',
        );
      }
    }
    const elementos = etapas.flatMap((etapa) => etapa.elementos);
    const cursos = elementos.map((elemento) => elemento.idCurso);
    if (new Set(cursos).size !== cursos.length) {
      throw errorRuta(
        HttpStatus.BAD_REQUEST,
        'CURSO_REPETIDO',
        'Un curso no puede aparecer dos veces en la misma versión.',
      );
    }
    const presentes = new Set(cursos);
    for (const elemento of elementos) {
      if (elemento.idCursoPrerrequisito == null) continue;
      if (!presentes.has(elemento.idCursoPrerrequisito)) {
        throw errorRuta(
          HttpStatus.BAD_REQUEST,
          'PRERREQUISITO_INVALIDO',
          'El prerrequisito debe ser un curso de la misma versión.',
        );
      }
    }
    if (hayCiclo(elementos)) {
      throw errorRuta(
        HttpStatus.BAD_REQUEST,
        'CICLO_PRERREQUISITOS',
        'Los prerrequisitos forman un ciclo.',
      );
    }
    if (cursos.length > 0) {
      const activos = await this.prisma.catCursos.findMany({
        where: {
          idEmpresa: companyId,
          idCursos: { in: cursos },
          activo: { not: false },
        },
        select: { idCursos: true },
      });
      if (activos.length !== cursos.length) {
        throw errorRuta(
          HttpStatus.BAD_REQUEST,
          'CURSO_INVALIDO',
          'Hay cursos que no pertenecen a la empresa o no están activos.',
        );
      }
    }
    await this.validarAlcance(companyId, alcance);
  }

  private async validarAlcance(companyId: number, alcance: AlcanceEscritura[]) {
    const ids = (campo: keyof AlcanceEscritura) => [
      ...new Set(
        alcance
          .map((regla) => regla[campo])
          .filter((valor): valor is number => typeof valor === 'number'),
      ),
    ];
    const [unidades, sites, puestos, areas, estados] = await Promise.all([
      buscarIds(ids('idUnidadOperativa'), (lista) =>
        this.prisma.catUnidadesOperativas
          .findMany({
            where: { idEmpresa: companyId, idUnidadOperativa: { in: lista } },
            select: { idUnidadOperativa: true },
          })
          .then((filas) => filas.map((fila) => fila.idUnidadOperativa)),
      ),
      buscarIds(ids('idSite'), (lista) =>
        this.prisma.catSites
          .findMany({
            where: { idEmpresa: companyId, idSite: { in: lista } },
            select: { idSite: true },
          })
          .then((filas) => filas.map((fila) => fila.idSite)),
      ),
      buscarIds(ids('idPuesto'), (lista) =>
        this.prisma.catPuestos
          .findMany({
            where: { idEmpresa: companyId, idPuesto: { in: lista } },
            select: { idPuesto: true },
          })
          .then((filas) => filas.map((fila) => fila.idPuesto)),
      ),
      buscarIds(ids('idArea'), (lista) =>
        this.prisma.catAreas
          .findMany({
            where: { idEmpresa: companyId, idArea: { in: lista } },
            select: { idArea: true },
          })
          .then((filas) => filas.map((fila) => fila.idArea)),
      ),
      this.prisma.catSites.findMany({
        where: { idEmpresa: companyId, Estado: { not: null } },
        select: { Estado: true },
        distinct: ['Estado'],
      }),
    ]);
    const conocidos = new Set(
      estados
        .map((fila) => fila.Estado?.trim())
        .filter((estado): estado is string => !!estado),
    );
    const completo =
      unidades.length === ids('idUnidadOperativa').length &&
      sites.length === ids('idSite').length &&
      puestos.length === ids('idPuesto').length &&
      areas.length === ids('idArea').length &&
      alcance.every(
        (regla) => regla.estado == null || conocidos.has(regla.estado),
      );
    if (!completo) {
      throw errorRuta(
        HttpStatus.BAD_REQUEST,
        'ALCANCE_INVALIDO',
        'El alcance usa una unidad, un site, un puesto, un área o un estado que no son de la empresa.',
      );
    }
  }

  private fila(
    ruta: {
      idRutaAprendizaje: number;
      nombre: string;
      proposito: string;
      activo: boolean;
      RutaVersiones: {
        idVersion: number;
        numero: number;
        estado: string;
        RutaEtapas: { RutaElementos: { idElemento: number }[] }[];
        RutaAlcances: {
          modo: 'incluir' | 'excluir';
          idUnidadOperativa: number | null;
          estado: string | null;
          idSite: number | null;
          idPuesto: number | null;
          idArea: number | null;
          CatSites: { Descripcion: string | null } | null;
          CatPuestos: { NombrePuesto: string } | null;
          CatAreas: { Descripcion: string } | null;
          CatUnidadesOperativas: { Nombre: string } | null;
        }[];
      }[];
    },
    stats: { asignados: number; cumplimiento: number } | undefined,
  ) {
    const actual = versionActual(ruta.RutaVersiones);
    const publicada = ruta.RutaVersiones.find(
      (version) => version.estado === 'publicada',
    );
    const borrador = ruta.RutaVersiones.find(
      (version) => version.estado === 'borrador',
    );
    return {
      idRutaAprendizaje: ruta.idRutaAprendizaje,
      nombre: ruta.nombre,
      proposito: ruta.proposito,
      numeroCursos: actual
        ? actual.RutaEtapas.reduce(
            (total, etapa) => total + etapa.RutaElementos.length,
            0,
          )
        : 0,
      numeroEtapas: actual?.RutaEtapas.length ?? 0,
      alcanceResumen: resumenAlcance(
        (actual?.RutaAlcances ?? []).map(reglaVisible),
      ),
      versionPublicada: publicada
        ? { idVersion: publicada.idVersion, numero: publicada.numero }
        : null,
      versionBorrador: borrador
        ? { idVersion: borrador.idVersion, numero: borrador.numero }
        : null,
      asignados: stats?.asignados ?? 0,
      cumplimiento: stats?.cumplimiento ?? 0,
      estado: estadoDe(ruta.RutaVersiones),
      activo: ruta.activo,
    };
  }

  private async estadisticas(ids: number[]) {
    const vacio = {
      porRuta: new Map<number, { asignados: number; cumplimiento: number }>(),
      kpis: {
        publicadas: 0,
        borradores: 0,
        empleadosConRuta: 0,
        cumplimiento: 0,
        vencidos: 0,
        porProgramar: 0,
      },
    };
    if (ids.length === 0) return vacio;
    const [rutas, asignaciones] = await Promise.all([
      this.prisma.rutaVersion.groupBy({
        by: ['idRutaAprendizaje', 'estado'],
        where: {
          idRutaAprendizaje: { in: ids },
          estado: { in: ['publicada', 'borrador'] },
        },
        _count: { _all: true },
      }),
      this.prisma.rutaAsignacion.findMany({
        where: {
          idRutaAprendizaje: { in: ids },
          estatus: { in: [...ESTATUS_ASIGNACION] },
        },
        select: {
          idRutaAprendizaje: true,
          idEmpleado: true,
          Cursos: {
            select: {
              estado: true,
              venceVigencia: true,
              RutaElemento: { select: { obligatorio: true } },
            },
          },
        },
      }),
    ]);

    const publicadas = new Set(
      rutas
        .filter((fila) => fila.estado === 'publicada')
        .map((fila) => fila.idRutaAprendizaje),
    );
    const conBorrador = new Set(
      rutas
        .filter((fila) => fila.estado === 'borrador')
        .map((fila) => fila.idRutaAprendizaje),
    );
    const hoy = hoyNegocio();
    const porRuta = new Map<
      number,
      { personas: Set<number>; obligatorios: number; vigentes: number }
    >();
    const personas = new Set<number>();
    let obligatorios = 0;
    let vigentes = 0;
    let vencidos = 0;
    let porProgramar = 0;

    for (const asignacion of asignaciones) {
      personas.add(asignacion.idEmpleado);
      const ruta = porRuta.get(asignacion.idRutaAprendizaje) ?? {
        personas: new Set<number>(),
        obligatorios: 0,
        vigentes: 0,
      };
      ruta.personas.add(asignacion.idEmpleado);
      for (const curso of asignacion.Cursos) {
        if (curso.estado === 'por_programar') porProgramar += 1;
        if (curso.estado === 'vencido') vencidos += 1;
        else if (
          (curso.estado === 'completado' || curso.estado === 'reconocido') &&
          curso.venceVigencia &&
          diaAlmacenado(curso.venceVigencia) < hoy
        ) {
          vencidos += 1;
        }
        if (!curso.RutaElemento.obligatorio) continue;
        obligatorios += 1;
        ruta.obligatorios += 1;
        if (cursoVigente(curso.estado, curso.venceVigencia, hoy)) {
          vigentes += 1;
          ruta.vigentes += 1;
        }
      }
      porRuta.set(asignacion.idRutaAprendizaje, ruta);
    }

    return {
      porRuta: new Map(
        [...porRuta.entries()].map(([id, ruta]) => [
          id,
          {
            asignados: ruta.personas.size,
            cumplimiento:
              ruta.obligatorios === 0
                ? 0
                : Math.round((ruta.vigentes / ruta.obligatorios) * 100),
          },
        ]),
      ),
      kpis: {
        publicadas: publicadas.size,
        borradores: [...conBorrador].filter((id) => !publicadas.has(id)).length,
        empleadosConRuta: personas.size,
        cumplimiento:
          obligatorios === 0 ? 0 : Math.round((vigentes / obligatorios) * 100),
        vencidos,
        porProgramar,
      },
    };
  }
}

function cursoVigente(
  estado: string,
  vence: Date | null,
  hoy: string,
): boolean {
  if (estado !== 'completado' && estado !== 'reconocido') return false;
  return !vence || diaAlmacenado(vence) >= hoy;
}

function paginar(page?: number, limit?: number) {
  const pagina = page && page > 0 ? page : 1;
  const tamano = limit && limit > 0 ? Math.min(limit, 100) : 10;
  return { page: pagina, limit: tamano, skip: (pagina - 1) * tamano };
}

function estadoDe(versiones: { estado: string }[]): 'publicada' | 'borrador' {
  return versiones.some((version) => version.estado === 'publicada')
    ? 'publicada'
    : 'borrador';
}

function versionActual<T extends { estado: string }>(
  versiones: T[],
): T | undefined {
  return (
    versiones.find((version) => version.estado === 'publicada') ??
    versiones.find((version) => version.estado === 'borrador')
  );
}

function reglaVisible(regla: {
  modo: 'incluir' | 'excluir';
  idUnidadOperativa: number | null;
  estado: string | null;
  idSite: number | null;
  idPuesto: number | null;
  idArea: number | null;
  CatSites: { Descripcion: string | null } | null;
  CatPuestos: { NombrePuesto: string } | null;
  CatAreas: { Descripcion: string } | null;
  CatUnidadesOperativas: { Nombre: string } | null;
}): ReglaVisible {
  return {
    modo: regla.modo,
    idUnidadOperativa: regla.idUnidadOperativa,
    estado: regla.estado,
    idSite: regla.idSite,
    idPuesto: regla.idPuesto,
    idArea: regla.idArea,
    nombreUnidad: regla.CatUnidadesOperativas?.Nombre ?? null,
    nombreSite: regla.CatSites?.Descripcion ?? null,
    nombrePuesto: regla.CatPuestos?.NombrePuesto ?? null,
    nombreArea: regla.CatAreas?.Descripcion ?? null,
  };
}

function includeVersion() {
  return {
    RutaEtapas: {
      orderBy: { orden: 'asc' as const },
      include: {
        RutaElementos: {
          orderBy: { orden: 'asc' as const },
          include: {
            CatCursos: {
              select: {
                Descripcion: true,
                esNormativoStps: true,
                CursoSesiones: {
                  orderBy: { creadoEn: 'desc' as const },
                  take: 1,
                  select: {
                    modalidad: true,
                    CursoContenidos: { select: { tipoContenido: true } },
                  },
                },
              },
            },
          },
        },
      },
    },
    RutaAlcances: {
      include: {
        CatSites: { select: { Descripcion: true } },
        CatPuestos: { select: { NombrePuesto: true } },
        CatAreas: { select: { Descripcion: true } },
        CatUnidadesOperativas: { select: { Nombre: true } },
      },
    },
  };
}

/** Misma regla del motor: alta, movimiento, publicación y el cron aplican a la ruta vigente, sin mirar el propósito. */
export function disparadoresDeRuta(vigente: boolean) {
  return {
    alta: vigente,
    movimiento: vigente,
    publicacion: vigente,
    programado: vigente,
  };
}

function mapearVersion(version: {
  idVersion: number;
  numero: number;
  estado: string;
  basadaEnVersion: number | null;
  publicadaEn: Date | null;
  publicadaPor: string | null;
  RutaEtapas: {
    idEtapa: number;
    nombre: string;
    orden: number;
    diaInicio: number;
    diaFin: number;
    requiereEtapaAnterior: boolean;
    RutaElementos: {
      idElemento: number;
      idCurso: number;
      orden: number;
      obligatorio: boolean;
      idElementoPrerrequisito: number | null;
      vigenciaMeses: number | null;
      CatCursos: {
        Descripcion: string | null;
        esNormativoStps: boolean;
        CursoSesiones: {
          modalidad: string;
          CursoContenidos: { tipoContenido: string } | null;
        }[];
      } | null;
    }[];
  }[];
  RutaAlcances: (Parameters<typeof reglaVisible>[0] & { idAlcance: number })[];
}) {
  const cursoDeElemento = new Map<number, number>();
  for (const etapa of version.RutaEtapas) {
    for (const elemento of etapa.RutaElementos)
      cursoDeElemento.set(elemento.idElemento, elemento.idCurso);
  }
  return {
    idVersion: version.idVersion,
    numero: version.numero,
    estado: version.estado,
    basadaEnVersion: version.basadaEnVersion,
    publicadaEn: version.publicadaEn,
    publicadaPor: version.publicadaPor,
    etapas: version.RutaEtapas.map((etapa) => ({
      idEtapa: etapa.idEtapa,
      nombre: etapa.nombre,
      orden: etapa.orden,
      diaInicio: etapa.diaInicio,
      diaFin: etapa.diaFin,
      requiereEtapaAnterior: etapa.requiereEtapaAnterior,
      elementos: etapa.RutaElementos.map((elemento) => {
        const sesion = elemento.CatCursos?.CursoSesiones[0];
        return {
          idElemento: elemento.idElemento,
          idCurso: elemento.idCurso,
          nombre: elemento.CatCursos?.Descripcion ?? null,
          modalidad: sesion?.modalidad ?? null,
          tipoContenido: sesion?.CursoContenidos?.tipoContenido ?? null,
          orden: elemento.orden,
          obligatorio: elemento.obligatorio,
          idElementoPrerrequisito: elemento.idElementoPrerrequisito,
          idCursoPrerrequisito: elemento.idElementoPrerrequisito
            ? (cursoDeElemento.get(elemento.idElementoPrerrequisito) ?? null)
            : null,
          vigenciaMeses: elemento.vigenciaMeses,
          esNormativoStps: elemento.CatCursos?.esNormativoStps ?? false,
        };
      }),
    })),
    alcance: version.RutaAlcances.map((regla) => ({
      idAlcance: regla.idAlcance,
      ...reglaVisible(regla),
    })),
  };
}

function normalizarEtapas(etapas: EtapaVersionDto[]): EtapaEscritura[] {
  return etapas.map((etapa) => ({
    nombre: etapa.nombre.trim(),
    orden: etapa.orden,
    diaInicio: etapa.diaInicio,
    diaFin: etapa.diaFin,
    requiereEtapaAnterior: etapa.requiereEtapaAnterior ?? false,
    elementos: etapa.elementos.map((elemento) => ({
      idCurso: elemento.idCurso,
      orden: elemento.orden,
      obligatorio: elemento.obligatorio !== false,
      idCursoPrerrequisito: elemento.idCursoPrerrequisito ?? null,
      vigenciaMeses: elemento.vigenciaMeses ?? null,
    })),
  }));
}

function normalizarAlcance(alcance: AlcanceVersionDto[]): AlcanceEscritura[] {
  return alcance.map((regla) => ({
    modo: regla.modo,
    idUnidadOperativa: regla.idUnidadOperativa ?? null,
    estado: regla.estado?.trim() || null,
    idSite: regla.idSite ?? null,
    idPuesto: regla.idPuesto ?? null,
    idArea: regla.idArea ?? null,
  }));
}

function estructuraDe(version: {
  RutaEtapas: {
    nombre: string;
    orden: number;
    diaInicio: number;
    diaFin: number;
    requiereEtapaAnterior: boolean;
    RutaElementos: {
      idElemento: number;
      idCurso: number;
      orden: number;
      obligatorio: boolean;
      idElementoPrerrequisito: number | null;
      vigenciaMeses: number | null;
    }[];
  }[];
}): EtapaEscritura[] {
  const cursoDe = new Map<number, number>();
  for (const etapa of version.RutaEtapas) {
    for (const elemento of etapa.RutaElementos)
      cursoDe.set(elemento.idElemento, elemento.idCurso);
  }
  return version.RutaEtapas.map((etapa) => ({
    nombre: etapa.nombre,
    orden: etapa.orden,
    diaInicio: etapa.diaInicio,
    diaFin: etapa.diaFin,
    requiereEtapaAnterior: etapa.requiereEtapaAnterior,
    elementos: etapa.RutaElementos.map((elemento) => ({
      idCurso: elemento.idCurso,
      orden: elemento.orden,
      obligatorio: elemento.obligatorio,
      idCursoPrerrequisito: elemento.idElementoPrerrequisito
        ? (cursoDe.get(elemento.idElementoPrerrequisito) ?? null)
        : null,
      vigenciaMeses: elemento.vigenciaMeses,
    })),
  }));
}

function alcanceDe(version: {
  RutaAlcances: AlcanceEscritura[];
}): AlcanceEscritura[] {
  return version.RutaAlcances.map((regla) => ({
    modo: regla.modo,
    idUnidadOperativa: regla.idUnidadOperativa,
    estado: regla.estado,
    idSite: regla.idSite,
    idPuesto: regla.idPuesto,
    idArea: regla.idArea,
  }));
}

async function escribirEstructura(
  tx: Cliente,
  idVersion: number,
  etapas: EtapaEscritura[],
  alcance: AlcanceEscritura[],
) {
  const porCurso = new Map<number, number>();
  for (const etapa of etapas) {
    const creada = await tx.rutaEtapa.create({
      data: {
        idVersion,
        nombre: etapa.nombre,
        orden: etapa.orden,
        diaInicio: etapa.diaInicio,
        diaFin: etapa.diaFin,
        requiereEtapaAnterior: etapa.requiereEtapaAnterior,
        RutaElementos: etapa.elementos.length
          ? {
              create: etapa.elementos.map((elemento) => ({
                idVersion,
                idCurso: elemento.idCurso,
                orden: elemento.orden,
                obligatorio: elemento.obligatorio,
                vigenciaMeses: elemento.vigenciaMeses,
              })),
            }
          : undefined,
      },
      include: {
        RutaElementos: { select: { idElemento: true, idCurso: true } },
      },
    });
    for (const elemento of creada.RutaElementos)
      porCurso.set(elemento.idCurso, elemento.idElemento);
  }
  for (const etapa of etapas) {
    for (const elemento of etapa.elementos) {
      if (elemento.idCursoPrerrequisito == null) continue;
      const idElemento = porCurso.get(elemento.idCurso);
      const prerrequisito = porCurso.get(elemento.idCursoPrerrequisito);
      if (idElemento == null || prerrequisito == null) continue;
      await tx.rutaElemento.update({
        where: { idElemento },
        data: { idElementoPrerrequisito: prerrequisito },
      });
    }
  }
  if (alcance.length > 0) {
    await tx.rutaAlcance.createMany({
      data: alcance.map((regla) => ({ idVersion, ...regla })),
    });
  }
}

function hayCiclo(elementos: ElementoEscritura[]): boolean {
  const siguiente = new Map<number, number>();
  for (const elemento of elementos) {
    if (elemento.idCursoPrerrequisito != null)
      siguiente.set(elemento.idCurso, elemento.idCursoPrerrequisito);
  }
  const vistos = new Set<number>();
  const pila = new Set<number>();
  const visitar = (curso: number): boolean => {
    if (pila.has(curso)) return true;
    if (vistos.has(curso)) return false;
    vistos.add(curso);
    pila.add(curso);
    const prerrequisito = siguiente.get(curso);
    if (prerrequisito != null && visitar(prerrequisito)) return true;
    pila.delete(curso);
    return false;
  };
  return [...siguiente.keys()].some((curso) => visitar(curso));
}

async function buscarIds(
  ids: number[],
  consulta: (ids: number[]) => Promise<number[]>,
): Promise<number[]> {
  if (ids.length === 0) return [];
  return consulta(ids);
}

function nombreCopia(nombre: string): string {
  const sufijo = ' (copia)';
  return `${nombre.slice(0, 200 - sufijo.length)}${sufijo}`;
}

function nombrePersona(empleado: {
  nombre: string | null;
  primerApellido: string | null;
  segundoApellido: string | null;
}): string {
  return [empleado.nombre, empleado.primerApellido, empleado.segundoApellido]
    .filter(Boolean)
    .join(' ');
}

function bitacora(
  user: ActiveUserDto,
  companyId: number,
  accion: string,
  id: number,
  verbo: string,
) {
  return {
    idUsuario: user.id,
    idEmpresa: companyId,
    accion,
    tablaOrigen: 'RutaAprendizaje',
    idRegistro: String(id),
    descripcion: `${user.first_name} ${user.last_name} ${verbo}`,
    fechaCreacion: new Date(),
  };
}

function esPrisma(error: unknown, codigo: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === codigo
  );
}
