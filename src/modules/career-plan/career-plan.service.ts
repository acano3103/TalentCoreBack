import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { PlanCarreraEstatus } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { localDateString } from 'src/modules/attendance/utils/timezone.util';
import {
  CAREER_EVENTO_MOVIMIENTO,
  HechoMovimientoCarrera,
} from 'src/common/events/career-hechos';
import { zonaValida } from 'src/modules/communications/reminders/zona-reloj';
import { diaAlmacenado, diaPrisma } from '../learning-paths/engine/impacto';
import { exigirModulo } from '../learning-paths/permiso-modulo';
import { RutaAvisosService } from '../learning-paths/engine/ruta-avisos.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { ConfigurationService } from '../configuration/configuration.service';
import { InternalMovementsService } from '../internal-movements/internal-movements.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { CreatePostulacionDto } from './dto/create-postulacion.dto';
import {
  ListarColaboradoresQuery,
  NominateDto,
  UpdateRouteDto,
} from './dto/career-plan.dto';
import { PLAN_CARRERA_TIPO_CURSO } from './career-plan.constants';
import { evaluarCursos } from './career-plan.avance';
import {
  PlazasPuesto,
  decidirTransicion,
  desglosePlazas,
  elegirInicio,
  mesesEnPuesto,
  nivelPreparacion,
  porcentajeRequisitos,
  tipoDeNiveles,
  vigenciaDe,
} from './career-plan.evaluacion';

const ZONA = 'America/Mexico_City';
const MODULO = 'career-plan';
const ESTATUS_ABIERTOS: PlanCarreraEstatus[] = [
  'en_preparacion',
  'listo_para_ascenso',
  'en_riesgo',
];

const TIPO_BITACORA: Record<string, string> = {
  POSTULAR: 'postulacion',
  LISTO: 'listo',
  RENOVADO: 'listo',
  EN_RIESGO: 'en_riesgo',
  REGRESO_PREPARACION: 'en_preparacion',
  NOMINAR: 'nominado',
  PROMOVIDO: 'promovido',
  RECHAZO_MOVIMIENTO: 'listo',
};

interface RutaCarrera {
  idRuta: number;
  idPuestoOrigen: number;
  idPuestoDestino: number;
  tipo?: string | null;
  antiguedadMinimaMeses?: number | null;
  idRutaAprendizaje?: number | null;
  fechaRegistro?: Date | null;
}

interface PlanFila {
  idPlanCarrera: number;
  idEmpleado: number;
  idRuta: number;
  idPuestoActual: number;
  idPuestoObjetivo: number;
  estatus: string;
  fechaInscripcion: Date | null;
  fechaPromocion: Date | null;
  fechaLimiteRenovacion?: Date | null;
  idVersionRuta?: number | null;
}

interface CursoEvaluado {
  idCurso: number;
  estatus: string;
  calificacion: number | null;
  aprobado: boolean;
  idSesion: number | null;
  nombre: string | null;
  tipo: string | null;
  vigente: boolean;
  vence: string | null;
  vencido: boolean;
  cumplido: boolean;
}

export interface RequisitoEvaluado {
  clave: string;
  tipo: string;
  nombre: string | null;
  estado: string;
  cuenta: boolean;
  detalle?: {
    calificacion?: number | null;
    vigente?: boolean;
    vence?: string | null;
    meses?: number;
    requeridos?: number;
    desde?: string | null;
    libresEnSite?: number;
    idSite?: number | null;
    otrosSites?: number;
  };
}

interface AvanceEvaluado {
  plan: PlanFila;
  estatus: string;
  total: number;
  aprobados: number;
  porcentaje: number;
  nivelPreparacion: string;
  puestoActual: string | null;
  puestoObjetivo: string | null;
  cursos: CursoEvaluado[];
  requisitos: RequisitoEvaluado[];
  requisitosResumen: {
    cumplidos: number;
    total: number;
    cursos: { cumplidos: number; total: number };
    antiguedad: boolean;
    plaza: boolean;
  };
  plazasEnSite: number;
  fechaLimiteRenovacion: string | null;
  nombreEmpleado: string | null;
  correo: string | null;
  idSite: number | null;
  idJefeInmediato: number | null;
  antiguedadMeses: number;
}

export interface FichaAprendizaje {
  idRutaAprendizaje: number;
  nombre: string;
  idVersion: number | null;
  numero: number | null;
  totalCursos: number;
}

interface Actor {
  rh: boolean;
  idEmpleado: number | null;
}

@Injectable()
export class CareerPlanService {
  private readonly logger = new Logger(CareerPlanService.name);

  constructor(
    private prismaService: PrismaService,
    private configurationService: ConfigurationService,
    private movimientos: InternalMovementsService,
    @Optional()
    @Inject(RutaAvisosService)
    private readonly avisos?: RutaAvisosService,
  ) {}

  async findMap(
    companyId: number,
    idArea: number | undefined,
    user: ActiveUserDto,
  ) {
    await exigirModulo(this.prismaService, user, MODULO, 'ver');
    const caminos = await this.prismaService.relPuestoRuta.findMany({
      where: { idEmpresa: companyId, activo: true },
      orderBy: { fechaRegistro: 'asc' },
    });
    const ids = new Set<number>();
    for (const camino of caminos) {
      ids.add(camino.idPuestoOrigen);
      ids.add(camino.idPuestoDestino);
    }
    if (idArea != null) {
      const deArea = await this.prismaService.catPuestos.findMany({
        where: { idEmpresa: companyId, idArea, Activo: true },
        select: { idPuesto: true },
      });
      const idsArea = deArea.map((puesto) => puesto.idPuesto);
      if (idsArea.length > 0) {
        const conGente = await this.prismaService.empleados.groupBy({
          by: ['idPuesto'],
          where: {
            idEmpresa: companyId,
            activo: true,
            idPuesto: { in: idsArea },
          },
          _count: { _all: true },
        });
        for (const fila of conGente) {
          if (fila.idPuesto != null && fila._count._all > 0)
            ids.add(fila.idPuesto);
        }
      }
    }
    if (ids.size === 0) return { nodos: [], caminos: [] };

    const puestos = await this.prismaService.catPuestos.findMany({
      where: { idPuesto: { in: [...ids] } },
      select: {
        idPuesto: true,
        NombrePuesto: true,
        IdNivelSalario: true,
        idArea: true,
      },
    });
    const puestoMap = new Map(
      puestos.map((puesto) => [puesto.idPuesto, puesto]),
    );
    const areaIds = [
      ...new Set(
        puestos
          .map((puesto) => puesto.idArea)
          .filter((id): id is number => id != null),
      ),
    ];
    const areas = areaIds.length
      ? await this.prismaService.catAreas.findMany({
          where: { idArea: { in: areaIds } },
          select: { idArea: true, Descripcion: true },
        })
      : [];
    const nombreArea = new Map(
      areas.map((area) => [area.idArea, area.Descripcion]),
    );
    const personas = await this.conteoPersonas(companyId, [...ids]);
    const plazas = await this.plazasPorPuesto(companyId, [...ids]);
    const fichas = await this.fichasAprendizaje(
      caminos
        .map((camino) => camino.idRutaAprendizaje)
        .filter((id): id is number => id != null),
    );
    const config = await this.configurationService.getTrainingConfig(companyId);
    const planes = caminos.length
      ? await this.prismaService.planCarreraColaborador.findMany({
          where: { idRuta: { in: caminos.map((camino) => camino.idRuta) } },
        })
      : [];
    const avances = await this.evaluarPostulaciones(companyId, planes, 0);
    const porRuta = new Map<number, AvanceEvaluado[]>();
    for (const avance of avances) {
      const lista = porRuta.get(avance.plan.idRuta) ?? [];
      lista.push(avance);
      porRuta.set(avance.plan.idRuta, lista);
    }

    const nodos = [...ids]
      .map((idPuesto) => {
        const puesto = puestoMap.get(idPuesto);
        const cupo = plazas.get(idPuesto) ?? desglosePlazas([], [], new Map());
        return {
          idPuesto,
          nombre: puesto?.NombrePuesto ?? null,
          nivel: puesto?.IdNivelSalario ?? null,
          idArea: puesto?.idArea ?? null,
          nombreArea:
            puesto?.idArea != null
              ? (nombreArea.get(puesto.idArea) ?? null)
              : null,
          personas: personas.get(idPuesto) ?? 0,
          plazasLibres: { total: cupo.total, porSite: cupo.porSite },
        };
      })
      .sort(
        (a, b) =>
          (a.nivel ?? 0) - (b.nivel ?? 0) ||
          (a.nombre ?? '').localeCompare(b.nombre ?? ''),
      );

    return {
      nodos,
      caminos: caminos.map((camino) => {
        const lista = porRuta.get(camino.idRuta) ?? [];
        const destino = plazas.get(camino.idPuestoDestino);
        return {
          idRuta: camino.idRuta,
          idPuestoOrigen: camino.idPuestoOrigen,
          idPuestoDestino: camino.idPuestoDestino,
          puestoOrigen:
            puestoMap.get(camino.idPuestoOrigen)?.NombrePuesto ?? null,
          puestoDestino:
            puestoMap.get(camino.idPuestoDestino)?.NombrePuesto ?? null,
          tipo: camino.tipo,
          antiguedadMinimaMeses:
            camino.antiguedadMinimaMeses ??
            config.carreraAntiguedadDefaultMeses,
          rutaAprendizaje: this.fichaDelMapa(
            camino.idRutaAprendizaje
              ? fichas.get(camino.idRutaAprendizaje)
              : null,
          ),
          enPlan: lista.filter(
            (avance) =>
              avance.estatus !== 'promovido' && avance.estatus !== 'cancelado',
          ).length,
          listosAhora: lista.filter(
            (avance) =>
              avance.estatus === 'listo_para_ascenso' &&
              avance.nivelPreparacion === 'listo_ahora',
          ).length,
          plazasLibresDestino: destino?.total ?? 0,
        };
      }),
    };
  }

  async findRoutes(companyId: number) {
    const routes = await this.prismaService.relPuestoRuta.findMany({
      where: { idEmpresa: companyId, activo: true },
      orderBy: { fechaRegistro: 'asc' },
    });
    if (routes.length === 0) return [];

    const puestoIds = [
      ...new Set(
        routes.flatMap((ruta) => [ruta.idPuestoOrigen, ruta.idPuestoDestino]),
      ),
    ];
    const puestos = await this.prismaService.catPuestos.findMany({
      where: { idPuesto: { in: puestoIds } },
      select: { idPuesto: true, NombrePuesto: true },
    });
    const puestoMap = new Map(
      puestos.map((puesto) => [puesto.idPuesto, puesto.NombrePuesto]),
    );
    const destinoIds = [...new Set(routes.map((ruta) => ruta.idPuestoDestino))];
    const rel = await this.prismaService.relPuestoCurso.findMany({
      where: {
        idPuesto: { in: destinoIds },
        idTipoCurso: PLAN_CARRERA_TIPO_CURSO,
        activo: true,
      },
    });
    const cursoIds = [...new Set(rel.map((fila) => fila.idCurso))];
    const cursos = cursoIds.length
      ? await this.prismaService.catCursos.findMany({
          where: { idCursos: { in: cursoIds } },
          select: { idCursos: true, Descripcion: true },
        })
      : [];
    const cursoMap = new Map(
      cursos.map((curso) => [curso.idCursos, curso.Descripcion]),
    );
    const agrupados = await this.prismaService.planCarreraColaborador.groupBy({
      by: ['idRuta'],
      where: { idRuta: { in: routes.map((ruta) => ruta.idRuta) } },
      _count: { _all: true },
    });
    const countMap = new Map(
      agrupados.map((fila) => [fila.idRuta, fila._count._all]),
    );
    const fichas = await this.fichasAprendizaje(
      routes
        .map((ruta) => ruta.idRutaAprendizaje)
        .filter((id): id is number => id != null),
    );

    return routes.map((route) => ({
      idRuta: route.idRuta,
      idPuestoOrigen: route.idPuestoOrigen,
      idPuestoDestino: route.idPuestoDestino,
      puestoOrigen: puestoMap.get(route.idPuestoOrigen) || null,
      puestoDestino: puestoMap.get(route.idPuestoDestino) || null,
      cursos: rel
        .filter((fila) => fila.idPuesto === route.idPuestoDestino)
        .map((fila) => ({
          idCurso: fila.idCurso,
          descripcion: cursoMap.get(fila.idCurso) || null,
        })),
      totalColaboradores: countMap.get(route.idRuta) || 0,
      fechaRegistro: route.fechaRegistro,
      tipo: route.tipo,
      antiguedadMinimaMeses: route.antiguedadMinimaMeses,
      idRutaAprendizaje: route.idRutaAprendizaje,
      rutaAprendizaje: route.idRutaAprendizaje
        ? (fichas.get(route.idRutaAprendizaje) ?? null)
        : null,
    }));
  }

  async createRoute(
    companyId: number,
    createRouteDto: CreateRouteDto,
    user: ActiveUserDto,
  ) {
    const { idPuestoOrigen, idPuestoDestino } = createRouteDto;
    if (idPuestoOrigen === idPuestoDestino) {
      throw new BadRequestException(
        'El puesto origen y destino no pueden ser el mismo',
      );
    }
    const tipo = await this.tipoDePuestos(
      companyId,
      idPuestoOrigen,
      idPuestoDestino,
    );
    if (createRouteDto.idRutaAprendizaje != null) {
      await this.exigirRutaAprendizaje(
        companyId,
        createRouteDto.idRutaAprendizaje,
      );
    }
    const extra = this.extraRuta(createRouteDto, tipo);

    const existente = await this.prismaService.relPuestoRuta.findFirst({
      where: { idEmpresa: companyId, idPuestoOrigen, idPuestoDestino },
    });
    if (existente?.activo) {
      throw new BadRequestException('La ruta entre estos puestos ya existe');
    }
    if (existente) {
      const ruta = await this.prismaService.relPuestoRuta.update({
        where: { idRuta: existente.idRuta },
        data: { activo: true, usuarioRegistro: user.uuid, ...extra },
      });
      await this.bitacora(
        companyId,
        user.id,
        'REACTIVAR',
        'RelPuestoRuta',
        ruta.idRuta,
        `Ruta de carrera reactivada por ${user.first_name} ${user.last_name}`,
      );
      return ruta;
    }

    const ruta = await this.prismaService.relPuestoRuta.create({
      data: {
        idEmpresa: companyId,
        idPuestoOrigen,
        idPuestoDestino,
        activo: true,
        usuarioRegistro: user.uuid,
        ...extra,
      },
    });
    await this.bitacora(
      companyId,
      user.id,
      'CREATE',
      'RelPuestoRuta',
      ruta.idRuta,
      `Ruta de carrera creada (puesto ${idPuestoOrigen} -> ${idPuestoDestino}) por ${user.first_name} ${user.last_name}`,
    );
    return ruta;
  }

  async updateRoute(
    companyId: number,
    routeId: number,
    dto: UpdateRouteDto,
    user: ActiveUserDto,
  ) {
    await exigirModulo(this.prismaService, user, MODULO, 'editar');
    const route = await this.prismaService.relPuestoRuta.findFirst({
      where: { idEmpresa: companyId, idRuta: routeId },
    });
    if (!route) {
      throw new NotFoundException(
        'Ruta no encontrada o no pertenece a la empresa',
      );
    }
    const tipo = await this.tipoDePuestos(
      companyId,
      route.idPuestoOrigen,
      route.idPuestoDestino,
    );
    if (dto.idRutaAprendizaje != null) {
      await this.exigirRutaAprendizaje(companyId, dto.idRutaAprendizaje);
    }
    const ruta = await this.prismaService.relPuestoRuta.update({
      where: { idRuta: routeId },
      data: {
        tipo,
        ...(dto.antiguedadMinimaMeses !== undefined
          ? { antiguedadMinimaMeses: dto.antiguedadMinimaMeses }
          : {}),
        ...(dto.idRutaAprendizaje !== undefined
          ? { idRutaAprendizaje: dto.idRutaAprendizaje }
          : {}),
      },
    });
    await this.bitacora(
      companyId,
      user.id,
      'UPDATE',
      'RelPuestoRuta',
      routeId,
      `Ruta de carrera actualizada por ${user.first_name} ${user.last_name}`,
    );
    return ruta;
  }

  async disableRoute(companyId: number, routeId: number, user: ActiveUserDto) {
    const route = await this.prismaService.relPuestoRuta.findFirst({
      where: { idEmpresa: companyId, idRuta: routeId },
    });
    if (!route) {
      throw new NotFoundException(
        'Ruta no encontrada o no pertenece a la empresa',
      );
    }
    await this.prismaService.relPuestoRuta.update({
      where: { idRuta: routeId },
      data: { activo: false },
    });
    await this.bitacora(
      companyId,
      user.id,
      'DESACTIVAR',
      'RelPuestoRuta',
      routeId,
      `Ruta de carrera desactivada por ${user.first_name} ${user.last_name}`,
    );
    return { message: 'Ruta desactivada correctamente' };
  }

  async findRouteCourses(companyId: number, routeId: number) {
    const route = await this.prismaService.relPuestoRuta.findFirst({
      where: { idEmpresa: companyId, idRuta: routeId, activo: true },
    });
    if (!route) {
      throw new NotFoundException(
        'Ruta no encontrada o no pertenece a la empresa',
      );
    }
    const rel = await this.prismaService.relPuestoCurso.findMany({
      where: {
        idPuesto: route.idPuestoDestino,
        idTipoCurso: PLAN_CARRERA_TIPO_CURSO,
        activo: true,
      },
    });
    const cursoIds = [...new Set(rel.map((fila) => fila.idCurso))];
    const cursos = cursoIds.length
      ? await this.prismaService.catCursos.findMany({
          where: { idCursos: { in: cursoIds } },
          include: {
            CatTipoCurso: { select: { idTipoCurso: true, Descripcion: true } },
          },
        })
      : [];
    const cursoMap = new Map(cursos.map((curso) => [curso.idCursos, curso]));
    return {
      idRuta: route.idRuta,
      idPuestoDestino: route.idPuestoDestino,
      cursos: rel.map((fila) => {
        const curso = cursoMap.get(fila.idCurso);
        return {
          idCurso: fila.idCurso,
          descripcion: curso?.Descripcion || null,
          tipo: curso?.CatTipoCurso?.Descripcion || null,
          idTipoCurso: fila.idTipoCurso,
        };
      }),
    };
  }

  async findColaboradores(
    companyId: number,
    query: ListarColaboradoresQuery = {},
    user?: ActiveUserDto,
  ) {
    const vacio = {
      colaboradores: [],
      kpis: this.kpisVacios(),
    };
    const routes = await this.prismaService.relPuestoRuta.findMany({
      where: {
        idEmpresa: companyId,
        ...(query.idRuta ? { idRuta: query.idRuta } : {}),
      },
      select: { idRuta: true },
    });
    if (routes.length === 0) return vacio;

    const actor = user
      ? await this.actorDe(companyId, user)
      : { rh: false, idEmpleado: null };
    let equipo: number[] | null = null;
    if (query.vista === 'mi_equipo') {
      if (actor.idEmpleado == null) return vacio;
      const gente = await this.prismaService.empleados.findMany({
        where: {
          idEmpresa: companyId,
          idJefeInmediato: actor.idEmpleado,
          activo: true,
        },
        select: { idEmpleado: true },
      });
      equipo = gente.map((persona) => persona.idEmpleado);
      if (equipo.length === 0) return vacio;
    }

    const postulaciones =
      await this.prismaService.planCarreraColaborador.findMany({
        where: {
          idRuta: { in: routes.map((ruta) => ruta.idRuta) },
          ...(equipo ? { idEmpleado: { in: equipo } } : {}),
        },
        orderBy: { fechaInscripcion: 'asc' },
      });
    if (postulaciones.length === 0) return vacio;

    const avances = await this.evaluarPostulaciones(
      companyId,
      postulaciones,
      user?.id ?? 0,
    );
    const config = await this.configurationService.getTrainingConfig(companyId);
    let filas = avances.map((avance) => ({
      idPlanCarrera: avance.plan.idPlanCarrera,
      idEmpleado: avance.plan.idEmpleado,
      nombreEmpleado: avance.nombreEmpleado,
      correo: avance.correo,
      idRuta: avance.plan.idRuta,
      idPuestoActual: avance.plan.idPuestoActual,
      idPuestoObjetivo: avance.plan.idPuestoObjetivo,
      puestoActual: avance.puestoActual,
      puestoObjetivo: avance.puestoObjetivo,
      estatus: avance.estatus,
      totalCursos: avance.total,
      cursosAprobados: avance.aprobados,
      porcentajeAvance: avance.porcentaje,
      porcentaje: avance.porcentaje,
      nivelPreparacion: avance.nivelPreparacion,
      requisitosResumen: avance.requisitosResumen,
      puedeNominar:
        this.cubre(actor, avance.idJefeInmediato) &&
        avance.estatus === 'listo_para_ascenso' &&
        (!config.carreraRequierePlaza || avance.plazasEnSite > 0),
      fechaInscripcion: avance.plan.fechaInscripcion,
      fechaPromocion: avance.plan.fechaPromocion,
      idSite: avance.idSite,
    }));
    if (query.estatus) {
      filas = filas.filter((fila) => fila.estatus === query.estatus);
    }
    if (query.idSite != null) {
      filas = filas.filter((fila) => fila.idSite === query.idSite);
    }
    if (query.search?.trim()) {
      const texto = query.search.trim().toLowerCase();
      filas = filas.filter(
        (fila) =>
          (fila.nombreEmpleado ?? '').toLowerCase().includes(texto) ||
          (fila.correo ?? '').toLowerCase().includes(texto),
      );
    }
    const hoy = await this.hoyEmpresa(companyId);
    const sitios = await this.nombresDeSites(filas.map((fila) => fila.idSite));
    return {
      colaboradores: filas.map((fila) => ({
        ...fila,
        nombreSite:
          fila.idSite != null ? sitios.get(fila.idSite) || null : null,
      })),
      kpis: this.kpisDe(filas, hoy),
    };
  }

  async kpisColaboradores(
    companyId: number,
    query: ListarColaboradoresQuery = {},
    user?: ActiveUserDto,
  ) {
    if (user) await exigirModulo(this.prismaService, user, MODULO, 'ver');
    const { kpis } = await this.findColaboradores(companyId, query, user);
    return { kpis };
  }

  async findPlanesEmpleado(companyId: number, idEmpleado: number) {
    const postulaciones = await this.planesDe(companyId, idEmpleado);
    if (postulaciones.length === 0) return { planes: [] };
    const avances = await this.evaluarPostulaciones(
      companyId,
      postulaciones,
      0,
    );
    return {
      planes: avances.map((avance) => ({
        idPlanCarrera: avance.plan.idPlanCarrera,
        estatus: avance.estatus as
          | 'en_preparacion'
          | 'listo_para_ascenso'
          | 'en_riesgo'
          | 'nominado'
          | 'promovido'
          | 'cancelado',
        puestoActual: avance.puestoActual || '',
        puestoObjetivo: avance.puestoObjetivo || '',
        fechaInscripcion: aIso(avance.plan.fechaInscripcion),
        fechaPromocion: aIso(avance.plan.fechaPromocion),
        porcentaje: avance.porcentaje,
        aprobados: avance.aprobados,
        total: avance.total,
        cursos: avance.cursos.map((curso) => ({
          idCurso: curso.idCurso,
          nombre: curso.nombre || '',
          estatus: curso.estatus,
          calificacion: curso.calificacion,
          idSesion: curso.idSesion,
        })),
        nivelPreparacion: avance.nivelPreparacion,
        requisitos: requisitosMovil(avance.requisitos, avance.cursos),
        fechaLimiteRenovacion: avance.fechaLimiteRenovacion,
        cursoVencido: cursoVencidoDe(avance.cursos),
      })),
    };
  }

  async resumenEmpleado(companyId: number, idEmpleado: number) {
    const { planes } = await this.findPlanesEmpleado(companyId, idEmpleado);
    const elegido =
      planes.find((plan) => plan.estatus !== 'promovido') ?? planes[0];
    if (!elegido) return null;
    return {
      puestoObjetivo: elegido.puestoObjetivo,
      porcentaje: elegido.porcentaje,
      estatus: elegido.estatus,
    };
  }

  async contarRutasCompletas(
    companyId: number,
    idEmpleado: number,
  ): Promise<number> {
    const { planes } = await this.findPlanesEmpleado(companyId, idEmpleado);
    return planes.filter((plan) => plan.porcentaje >= 100).length;
  }

  async createPostulacion(
    companyId: number,
    createPostulacionDto: CreatePostulacionDto,
    user: ActiveUserDto,
  ) {
    const { idEmpleado, idRuta } = createPostulacionDto;
    const route = await this.prismaService.relPuestoRuta.findFirst({
      where: { idEmpresa: companyId, idRuta, activo: true },
    });
    if (!route) {
      throw new BadRequestException(
        'La ruta no existe o está inactiva en la empresa',
      );
    }
    const empleado = await this.prismaService.empleados.findFirst({
      where: { idEmpleado, idEmpresa: companyId, activo: true },
    });
    if (!empleado) {
      throw new BadRequestException(
        'El colaborador no existe o está inactivo en la empresa',
      );
    }
    if (!empleado.idPuesto) {
      throw new BadRequestException(
        'El colaborador no tiene un puesto asignado',
      );
    }
    const origen = await this.exigirOrigen(
      companyId,
      empleado.idJefeInmediato,
      user,
    );
    const existente = await this.prismaService.planCarreraColaborador.findFirst(
      { where: { idEmpleado, idRuta } },
    );
    if (existente) {
      throw new BadRequestException(
        'El colaborador ya está postulado a esta ruta',
      );
    }
    const idVersionRuta = await this.versionPublicada(route.idRutaAprendizaje);
    const plan = await this.prismaService.planCarreraColaborador.create({
      data: {
        idEmpleado,
        idRuta,
        idPuestoActual: empleado.idPuesto,
        idPuestoObjetivo: route.idPuestoDestino,
        estatus: 'en_preparacion',
        usuarioRegistro: user.uuid,
        origen,
        ...(idVersionRuta != null ? { idVersionRuta } : {}),
      },
    });
    await this.bitacora(
      companyId,
      user.id,
      'POSTULAR',
      'PlanCarreraColaborador',
      plan.idPlanCarrera,
      `Colaborador ${idEmpleado} postulado a la ruta (puesto ${route.idPuestoOrigen} -> ${route.idPuestoDestino}) por ${user.first_name} ${user.last_name}`,
    );
    this.logger.log(
      `Postulacion creada: plan=${plan.idPlanCarrera} empleado=${idEmpleado} ruta=${idRuta} origen=${origen}`,
    );
    return plan;
  }

  async nominate(
    companyId: number,
    planId: number,
    dto: NominateDto,
    user: ActiveUserDto,
  ) {
    const plan = await this.prismaService.planCarreraColaborador.findUnique({
      where: { idPlanCarrera: planId },
    });
    if (!plan) throw new NotFoundException('Postulación no encontrada');
    const empleado = await this.prismaService.empleados.findFirst({
      where: {
        idEmpleado: plan.idEmpleado,
        idEmpresa: companyId,
        activo: true,
      },
    });
    if (!empleado) {
      throw new NotFoundException('El colaborador no pertenece a la empresa');
    }
    await this.exigirOrigen(companyId, empleado.idJefeInmediato, user);
    const route = await this.prismaService.relPuestoRuta.findFirst({
      where: { idEmpresa: companyId, idRuta: plan.idRuta, activo: true },
    });
    if (!route) {
      throw new BadRequestException('La ruta no existe o está inactiva');
    }

    await this.evaluarPostulaciones(companyId, [plan], user.id);
    const fresco = await this.prismaService.planCarreraColaborador.findUnique({
      where: { idPlanCarrera: planId },
    });
    if (!fresco || fresco.estatus !== 'listo_para_ascenso') {
      throw new BadRequestException('El plan no está listo para ascenso.');
    }

    const config = await this.configurationService.getTrainingConfig(companyId);
    const plazas = await this.plazasPorPuesto(companyId, [
      plan.idPuestoObjetivo,
    ]);
    const enSite =
      plazas.get(plan.idPuestoObjetivo)?.enSite(empleado.idSite ?? null) ?? 0;
    if (config.carreraRequierePlaza && enSite <= 0) {
      throw new ConflictException({
        code: 'SIN_PLAZA',
        codigo: 'SIN_PLAZA',
        message: 'No hay plaza libre en el site del colaborador.',
      });
    }

    const nombreTipo = await this.nombreTipoMovimiento(
      route.tipo === 'lateral',
    );
    const fechaEfectiva =
      dto.fechaEfectiva ?? (await this.hoyEmpresa(companyId));
    const creado = await this.movimientos.createMovementRequest(
      user,
      companyId,
      {
        idEmpleado: plan.idEmpleado,
        tipoMovimiento: nombreTipo,
        fechaEfectiva,
        idPuestoNuevo: route.idPuestoDestino,
        motivo: dto.motivo,
        salarioBrutoNuevo: dto.salarioBrutoNuevo,
        idPlanCarrera: plan.idPlanCarrera,
      },
    );
    const idMovimiento = creado.data?.idMovimiento;
    if (idMovimiento == null) {
      throw new BadRequestException('No se pudo crear el movimiento interno.');
    }

    const actual = await this.prismaService.planCarreraColaborador.findUnique({
      where: { idPlanCarrera: planId },
    });
    if (actual && actual.estatus !== 'promovido') {
      await this.prismaService.planCarreraColaborador.update({
        where: { idPlanCarrera: planId },
        data: { estatus: 'nominado', idMovimiento },
      });
    } else if (actual && actual.idMovimiento == null) {
      await this.prismaService.planCarreraColaborador.update({
        where: { idPlanCarrera: planId },
        data: { idMovimiento },
      });
    }
    await this.bitacora(
      companyId,
      user.id,
      'NOMINAR',
      'PlanCarreraColaborador',
      planId,
      `Plan nominado con el movimiento ${idMovimiento} por ${user.first_name} ${user.last_name}`,
    );
    if (this.avisos) {
      const puesto = await this.prismaService.catPuestos.findUnique({
        where: { idPuesto: route.idPuestoDestino },
        select: { NombrePuesto: true },
      });
      await this.avisos.nominado({
        idEmpresa: companyId,
        idEmpleado: plan.idEmpleado,
        puesto: puesto?.NombrePuesto?.trim() || 'el siguiente puesto',
      });
    }
    return this.prismaService.planCarreraColaborador.findUnique({
      where: { idPlanCarrera: planId },
    });
  }

  async findColaborador(companyId: number, planId: number) {
    const postulacion =
      await this.prismaService.planCarreraColaborador.findUnique({
        where: { idPlanCarrera: planId },
      });
    if (!postulacion) throw new NotFoundException('Postulación no encontrada');
    const empleado = await this.prismaService.empleados.findFirst({
      where: { idEmpleado: postulacion.idEmpleado, idEmpresa: companyId },
      select: {
        idEmpleado: true,
        nombre: true,
        primerApellido: true,
        segundoApellido: true,
      },
    });
    if (!empleado) {
      throw new NotFoundException('El colaborador no pertenece a la empresa');
    }
    const [avance] = await this.evaluarPostulaciones(
      companyId,
      [postulacion],
      0,
    );
    const historial = await this.historialDe(companyId, planId);
    const sitios = await this.nombresDeSites([avance?.idSite]);
    return {
      idPlanCarrera: postulacion.idPlanCarrera,
      idEmpleado: postulacion.idEmpleado,
      nombreEmpleado:
        `${empleado.nombre ?? ''} ${empleado.primerApellido ?? ''} ${empleado.segundoApellido ?? ''}`.trim(),
      idRuta: postulacion.idRuta,
      idPuestoActual: postulacion.idPuestoActual,
      idPuestoObjetivo: postulacion.idPuestoObjetivo,
      puestoActual: avance?.puestoActual ?? null,
      puestoObjetivo: avance?.puestoObjetivo ?? null,
      estatus: avance?.estatus ?? postulacion.estatus,
      porcentajeAvance: avance?.porcentaje ?? 0,
      porcentaje: avance?.porcentaje ?? 0,
      idSite: avance?.idSite ?? null,
      nombreSite:
        avance?.idSite != null ? sitios.get(avance.idSite) || null : null,
      antiguedadMeses: avance?.antiguedadMeses ?? null,
      nivelPreparacion: avance?.nivelPreparacion ?? 'en_desarrollo',
      requisitos: avance?.requisitos ?? [],
      cursos: (avance?.cursos ?? []).map((curso) => ({
        idCurso: curso.idCurso,
        descripcion: curso.nombre,
        tipo: curso.tipo,
        estatus: curso.estatus,
        calificacion: curso.calificacion,
        aprobado: curso.aprobado,
        vigente: curso.vigente,
        vence: curso.vence,
      })),
      historial,
    };
  }

  @OnEvent(CAREER_EVENTO_MOVIMIENTO)
  async onMovimiento(hecho: HechoMovimientoCarrera): Promise<void> {
    try {
      if (!hecho?.idPlanCarrera || !hecho.tipo) return;
      if (hecho.tipo === 'APLICADO') {
        const fecha = hecho.fechaEfectiva
          ? new Date(hecho.fechaEfectiva)
          : new Date();
        const aplicado =
          await this.prismaService.planCarreraColaborador.updateMany({
            where: {
              idPlanCarrera: hecho.idPlanCarrera,
              estatus: {
                in: [
                  'nominado',
                  'listo_para_ascenso',
                  'en_riesgo',
                  'en_preparacion',
                ],
              },
            },
            data: {
              estatus: 'promovido',
              fechaPromocion: Number.isNaN(fecha.getTime())
                ? new Date()
                : fecha,
              idMovimiento: hecho.idMovimiento,
            },
          });
        if (aplicado.count > 0) {
          await this.bitacora(
            hecho.idEmpresa,
            hecho.idUsuario ?? 0,
            'PROMOVIDO',
            'PlanCarreraColaborador',
            hecho.idPlanCarrera,
            `El movimiento ${hecho.idMovimiento} se aplicó y el plan quedó promovido.`,
          );
          if (this.avisos) {
            const plan =
              await this.prismaService.planCarreraColaborador.findUnique({
                where: { idPlanCarrera: hecho.idPlanCarrera },
                select: { idEmpleado: true, idPuestoObjetivo: true },
              });
            const puesto = plan
              ? await this.prismaService.catPuestos.findUnique({
                  where: { idPuesto: plan.idPuestoObjetivo },
                  select: { NombrePuesto: true },
                })
              : null;
            if (plan) {
              await this.avisos.promovido({
                idEmpresa: hecho.idEmpresa,
                idEmpleado: plan.idEmpleado,
                puesto: puesto?.NombrePuesto?.trim() || 'el siguiente puesto',
              });
            }
          }
        }
        return;
      }
      const rechazado =
        await this.prismaService.planCarreraColaborador.updateMany({
          where: {
            idPlanCarrera: hecho.idPlanCarrera,
            estatus: 'nominado',
          },
          data: { estatus: 'listo_para_ascenso', idMovimiento: null },
        });
      if (rechazado.count > 0) {
        await this.bitacora(
          hecho.idEmpresa,
          hecho.idUsuario ?? 0,
          'RECHAZO_MOVIMIENTO',
          'PlanCarreraColaborador',
          hecho.idPlanCarrera,
          `El movimiento ${hecho.idMovimiento} se rechazó y el plan volvió a listo para ascenso.`,
        );
      }
    } catch (error) {
      const texto =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(
        `Plan de carrera (${hecho?.tipo ?? 'sin tipo'} ${hecho?.idPlanCarrera ?? ''}): ${texto}`,
      );
    }
  }

  @Cron('0 6 * * *', {
    name: 'carrera-revisar-planes',
    timeZone: ZONA,
  })
  async revisarPlanesDiario(): Promise<void> {
    try {
      const empresas = await this.prismaService.relPuestoRuta.findMany({
        where: { activo: true },
        select: { idEmpresa: true },
        distinct: ['idEmpresa'],
      });
      for (const empresa of empresas) {
        try {
          await this.revisarEmpresa(empresa.idEmpresa);
        } catch (error) {
          const texto =
            error instanceof Error ? error.message : 'Error desconocido';
          this.logger.error(
            `Revisión de planes de la empresa ${empresa.idEmpresa}: ${texto}`,
          );
        }
      }
    } catch (error) {
      const texto =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Revisión diaria de planes de carrera: ${texto}`);
    }
  }

  private async revisarEmpresa(companyId: number) {
    const rutas = await this.prismaService.relPuestoRuta.findMany({
      where: { idEmpresa: companyId },
      select: { idRuta: true },
    });
    if (rutas.length === 0) return;
    const planes = await this.prismaService.planCarreraColaborador.findMany({
      where: {
        idRuta: { in: rutas.map((ruta) => ruta.idRuta) },
        estatus: { in: ESTATUS_ABIERTOS },
      },
    });
    await this.evaluarPostulaciones(companyId, planes, 0);
  }

  private async evaluarPostulaciones(
    companyId: number,
    planes: PlanFila[],
    userId: number,
  ): Promise<AvanceEvaluado[]> {
    if (planes.length === 0) return [];
    const config = await this.configurationService.getTrainingConfig(companyId);
    const hoy = await this.hoyEmpresa(companyId);
    const rutaIds = [...new Set(planes.map((plan) => plan.idRuta))];
    const rutas = ((await this.prismaService.relPuestoRuta.findMany({
      where: { idRuta: { in: rutaIds } },
    })) ?? []) as RutaCarrera[];
    const rutaMap = new Map(rutas.map((ruta) => [ruta.idRuta, ruta]));

    const fijadas = planes
      .map((plan) => plan.idVersionRuta)
      .filter((id): id is number => id != null);
    const idsAprendizaje = rutas
      .map((ruta) => ruta.idRutaAprendizaje)
      .filter((id): id is number => id != null);
    const versiones =
      fijadas.length || idsAprendizaje.length
        ? await this.prismaService.rutaVersion.findMany({
            where: {
              OR: [
                ...(fijadas.length ? [{ idVersion: { in: fijadas } }] : []),
                ...(idsAprendizaje.length
                  ? [
                      {
                        idRutaAprendizaje: { in: idsAprendizaje },
                        estado: 'publicada' as const,
                      },
                    ]
                  : []),
              ],
            },
            select: {
              idVersion: true,
              idRutaAprendizaje: true,
              numero: true,
              estado: true,
            },
          })
        : [];
    const publicadaPorRuta = new Map<
      number,
      { idVersion: number; numero: number }
    >();
    for (const version of versiones) {
      if (version.estado !== 'publicada') continue;
      const actual = publicadaPorRuta.get(version.idRutaAprendizaje);
      if (!actual || version.numero > actual.numero) {
        publicadaPorRuta.set(version.idRutaAprendizaje, version);
      }
    }
    for (const plan of planes) {
      if (plan.idVersionRuta != null) continue;
      const ruta = rutaMap.get(plan.idRuta);
      const publicada = ruta?.idRutaAprendizaje
        ? publicadaPorRuta.get(ruta.idRutaAprendizaje)
        : undefined;
      if (!publicada) continue;
      await this.prismaService.planCarreraColaborador.update({
        where: { idPlanCarrera: plan.idPlanCarrera },
        data: { idVersionRuta: publicada.idVersion },
      });
      plan.idVersionRuta = publicada.idVersion;
    }

    const versionIds = [
      ...new Set(
        planes
          .map((plan) => plan.idVersionRuta)
          .filter((id): id is number => id != null),
      ),
    ];
    const elementos = versionIds.length
      ? await this.prismaService.rutaElemento.findMany({
          where: { idVersion: { in: versionIds }, obligatorio: true },
          select: {
            idVersion: true,
            idCurso: true,
            vigenciaMeses: true,
          },
        })
      : [];
    const elementosPorVersion = new Map<
      number,
      { idCurso: number; vigenciaMeses: number | null }[]
    >();
    for (const elemento of elementos) {
      const lista = elementosPorVersion.get(elemento.idVersion) ?? [];
      lista.push(elemento);
      elementosPorVersion.set(elemento.idVersion, lista);
    }

    const objetivoIds = [
      ...new Set(planes.map((plan) => plan.idPuestoObjetivo)),
    ];
    const rel = await this.prismaService.relPuestoCurso.findMany({
      where: {
        idPuesto: { in: objetivoIds },
        idTipoCurso: PLAN_CARRERA_TIPO_CURSO,
        activo: true,
      },
    });
    const mallaPorPuesto = new Map<number, number[]>();
    for (const fila of rel ?? []) {
      const lista = mallaPorPuesto.get(fila.idPuesto) ?? [];
      lista.push(fila.idCurso);
      mallaPorPuesto.set(fila.idPuesto, lista);
    }

    const cursoIds = new Set<number>();
    for (const elemento of elementos) cursoIds.add(elemento.idCurso);
    for (const ids of mallaPorPuesto.values()) {
      for (const id of ids) cursoIds.add(id);
    }
    const idsCurso = [...cursoIds];
    const cursos = idsCurso.length
      ? await this.prismaService.catCursos.findMany({
          where: { idCursos: { in: idsCurso } },
          include: {
            CatTipoCurso: { select: { Descripcion: true } },
          },
        })
      : [];
    const cursoMap = new Map(cursos.map((curso) => [curso.idCursos, curso]));
    const sesiones = idsCurso.length
      ? await this.prismaService.cursoSesiones.findMany({
          where: { idCurso: { in: idsCurso } },
          select: { idSesion: true, idCurso: true, fechaInicioPeriodo: true },
        })
      : [];
    const sesionIds = (sesiones ?? []).map((sesion) => sesion.idSesion);
    const empleadoIds = [...new Set(planes.map((plan) => plan.idEmpleado))];
    const participantes = sesionIds.length
      ? await this.prismaService.cursoParticipantes.findMany({
          where: {
            idEmpleado: { in: empleadoIds },
            idSesion: { in: sesionIds },
          },
        })
      : [];
    const zona = await this.zonaDe(companyId);
    const hayVigencia = elementos.some(
      (elemento) => elemento.vigenciaMeses != null,
    );
    const participanteIds = (participantes ?? [])
      .map((fila) => fila.idParticipante)
      .filter((id): id is number => id != null);
    const seguimientos =
      hayVigencia && participanteIds.length
        ? ((await this.prismaService.cursoSeguimientoParticipante.findMany({
            where: { idParticipante: { in: participanteIds } },
            select: { idParticipante: true, fechaConclusion: true },
          })) ?? [])
        : [];
    const conclusionPorParticipante = new Map(
      seguimientos.map((fila) => [
        fila.idParticipante,
        fila.fechaConclusion
          ? localDateString(fila.fechaConclusion, zona)
          : null,
      ]),
    );
    const asignaciones = versionIds.length
      ? await this.prismaService.rutaAsignacionCurso.findMany({
          where: {
            idCurso: { in: idsCurso.length ? idsCurso : [-1] },
            RutaAsignacion: {
              idEmpleado: { in: empleadoIds },
              idVersion: { in: versionIds },
            },
          },
          select: {
            idCurso: true,
            estado: true,
            venceVigencia: true,
            RutaAsignacion: { select: { idEmpleado: true, idVersion: true } },
          },
        })
      : [];

    const empleados = await this.prismaService.empleados.findMany({
      where: { idEmpleado: { in: empleadoIds } },
      select: {
        idEmpleado: true,
        nombre: true,
        primerApellido: true,
        segundoApellido: true,
        correo: true,
        idPuesto: true,
        idSite: true,
        fechaIngreso: true,
        idJefeInmediato: true,
      },
    });
    const empMap = new Map(
      (empleados ?? []).map((empleado) => [empleado.idEmpleado, empleado]),
    );
    const movimientos = await this.prismaService.movimientosInternos.findMany({
      where: {
        idEmpleado: { in: empleadoIds },
        estatus: 'APROBADA',
        idPuestoNuevo: { not: null },
      },
      select: {
        idEmpleado: true,
        idPuestoNuevo: true,
        fechaEfectiva: true,
        fechaRegistro: true,
      },
    });
    const puestoIds = [
      ...new Set(
        planes.flatMap((plan) => [plan.idPuestoActual, plan.idPuestoObjetivo]),
      ),
    ];
    const puestos = await this.prismaService.catPuestos.findMany({
      where: { idPuesto: { in: puestoIds } },
      select: { idPuesto: true, NombrePuesto: true },
    });
    const puestoMap = new Map(
      (puestos ?? []).map((puesto) => [puesto.idPuesto, puesto.NombrePuesto]),
    );
    const plazas = await this.plazasPorPuesto(companyId, objetivoIds);
    const umbral = config.calificacionAprobatoria;

    const salida: AvanceEvaluado[] = [];
    for (const plan of planes) {
      const ruta = rutaMap.get(plan.idRuta);
      const versionId = plan.idVersionRuta ?? null;
      const deVersion =
        versionId != null ? (elementosPorVersion.get(versionId) ?? []) : null;
      const malla =
        deVersion != null
          ? deVersion.map((elemento) => elemento.idCurso)
          : (mallaPorPuesto.get(plan.idPuestoObjetivo) ?? []);
      const avance = evaluarCursos(
        plan.idEmpleado,
        malla,
        sesiones ?? [],
        participantes ?? [],
        umbral,
      );
      const empleado = empMap.get(plan.idEmpleado);
      const puestoActualId = empleado?.idPuesto ?? plan.idPuestoActual;
      const fechasMovimiento = (movimientos ?? [])
        .filter(
          (movimiento) =>
            movimiento.idEmpleado === plan.idEmpleado &&
            movimiento.idPuestoNuevo === puestoActualId,
        )
        .map((movimiento) => {
          if (movimiento.fechaEfectiva)
            return diaAlmacenado(movimiento.fechaEfectiva);
          if (movimiento.fechaRegistro) {
            return localDateString(movimiento.fechaRegistro, zona);
          }
          return null;
        })
        .filter((fecha): fecha is string => fecha != null)
        .map((fecha) => ({ fecha }));
      const inicio = elegirInicio(
        fechasMovimiento,
        empleado?.fechaIngreso ? diaAlmacenado(empleado.fechaIngreso) : null,
      );
      const meses = mesesEnPuesto(inicio, hoy);
      const requeridos =
        ruta?.antiguedadMinimaMeses ?? config.carreraAntiguedadDefaultMeses;
      const antiguedadOk = meses >= requeridos;
      const cupo =
        plazas.get(plan.idPuestoObjetivo) ?? desglosePlazas([], [], new Map());
      const plazasEnSite = cupo.enSite(empleado?.idSite ?? null);
      const plazaOk = plazasEnSite > 0;

      const cursos = avance.cursos.map((curso) => {
        const ficha = cursoMap.get(curso.idCurso);
        const elemento = deVersion?.find(
          (fila) => fila.idCurso === curso.idCurso,
        );
        const filas = (asignaciones ?? [])
          .filter(
            (fila) =>
              fila.RutaAsignacion.idEmpleado === plan.idEmpleado &&
              fila.RutaAsignacion.idVersion === versionId &&
              fila.idCurso === curso.idCurso,
          )
          .map((fila) => ({
            estado: fila.estado,
            vence: fila.venceVigencia
              ? diaAlmacenado(fila.venceVigencia)
              : null,
          }));
        const conclusion = this.conclusionDe(
          plan.idEmpleado,
          curso.idCurso,
          sesiones ?? [],
          participantes ?? [],
          conclusionPorParticipante,
        );
        const marca =
          deVersion == null
            ? { vigente: true, caducada: false, vence: null as string | null }
            : vigenciaDe({
                vigenciaMeses: elemento?.vigenciaMeses ?? null,
                hoy,
                filas,
                fechaConclusion: conclusion,
              });
        const cumplido = curso.aprobado && marca.vigente;
        return {
          ...curso,
          nombre: ficha?.Descripcion ?? null,
          tipo: ficha?.CatTipoCurso?.Descripcion ?? null,
          vigente: marca.vigente,
          vence: marca.vence,
          vencido: marca.caducada,
          cumplido,
        };
      });
      const cursosCumplidos = cursos.filter((curso) => curso.cumplido).length;
      const cursoVencido =
        deVersion != null && cursos.some((curso) => curso.vencido);
      const prepCompleta = cursosCumplidos === cursos.length && antiguedadOk;
      const cumplidos =
        cursosCumplidos + (antiguedadOk ? 1 : 0) + (plazaOk ? 1 : 0);
      const totalReq = cursos.length + 2;
      const porcentaje = porcentajeRequisitos(cumplidos, totalReq);
      const nivel = nivelPreparacion({
        cursosCumplidos,
        cursos: cursos.length,
        antiguedadCumplida: antiguedadOk,
        mesesFaltantes: Math.max(0, requeridos - meses),
        plazasEnSite,
      });
      const transicion = decidirTransicion({
        estatus: plan.estatus,
        prepCompleta,
        cursoVencido,
        hoy,
        fechaLimiteRenovacion: plan.fechaLimiteRenovacion
          ? diaAlmacenado(plan.fechaLimiteRenovacion)
          : null,
        diasRenovacion: config.carreraDiasRenovacion,
      });
      if (transicion.cambio) {
        await this.persistir(companyId, plan.idPlanCarrera, transicion, userId);
        if (transicion.accion === 'EN_RIESGO') {
          await this.avisos?.enRiesgo({
            idEmpresa: companyId,
            idEmpleado: plan.idEmpleado,
            puesto:
              puestoMap.get(plan.idPuestoObjetivo) || 'el siguiente puesto',
          });
        }
      }
      const fechaLimiteRenovacion =
        transicion.fechaLimiteRenovacion !== undefined
          ? transicion.fechaLimiteRenovacion
          : plan.fechaLimiteRenovacion
            ? diaAlmacenado(plan.fechaLimiteRenovacion)
            : null;
      const requisitos = [
        ...cursos.map((curso) => ({
          clave: `curso:${curso.idCurso}`,
          tipo: 'curso' as const,
          nombre: curso.nombre,
          estado: curso.cumplido
            ? ('cumplido' as const)
            : ('pendiente' as const),
          cuenta: true,
          detalle: {
            calificacion: curso.calificacion,
            vigente: curso.vigente,
            vence: curso.vence,
          },
        })),
        {
          clave: 'antiguedad',
          tipo: 'antiguedad' as const,
          nombre: 'Antigüedad en el puesto',
          estado: antiguedadOk ? ('cumplido' as const) : ('pendiente' as const),
          cuenta: true,
          detalle: { meses, requeridos, desde: inicio },
        },
        {
          clave: 'plaza',
          tipo: 'plaza' as const,
          nombre: 'Plaza autorizada libre',
          estado: plazaOk ? ('cumplido' as const) : ('pendiente' as const),
          cuenta: true,
          detalle: {
            libresEnSite: plazasEnSite,
            idSite: empleado?.idSite ?? null,
            otrosSites: cupo.porSite
              .filter((fila) => fila.idSite !== empleado?.idSite)
              .reduce((suma, fila) => suma + fila.libres, 0),
          },
        },
        {
          clave: 'evaluacion_jefe',
          tipo: 'evaluacion_jefe' as const,
          nombre: 'Evaluación del jefe',
          estado: 'pendiente_fase_3' as const,
          cuenta: false,
        },
      ];
      salida.push({
        plan,
        estatus: transicion.estatus,
        total: avance.total,
        aprobados: avance.aprobados,
        porcentaje,
        nivelPreparacion: nivel,
        puestoActual: puestoMap.get(plan.idPuestoActual) || null,
        puestoObjetivo: puestoMap.get(plan.idPuestoObjetivo) || null,
        cursos,
        requisitos,
        requisitosResumen: {
          cumplidos,
          total: totalReq,
          cursos: { cumplidos: cursosCumplidos, total: cursos.length },
          antiguedad: antiguedadOk,
          plaza: plazaOk,
        },
        plazasEnSite,
        fechaLimiteRenovacion,
        nombreEmpleado: empleado
          ? `${empleado.nombre ?? ''} ${empleado.primerApellido ?? ''} ${empleado.segundoApellido ?? ''}`.trim()
          : null,
        correo: empleado?.correo ?? null,
        idSite: empleado?.idSite ?? null,
        idJefeInmediato: empleado?.idJefeInmediato ?? null,
        antiguedadMeses: meses,
      });
    }
    return salida;
  }

  private conclusionDe(
    idEmpleado: number,
    idCurso: number,
    sesiones: { idSesion: number; idCurso: number }[],
    participantes: {
      idParticipante?: number;
      idEmpleado: number;
      idSesion: number;
      estatusAsignacion?: string | null;
    }[],
    conclusiones: Map<number, string | null>,
  ): string | null {
    const sesionesCurso = new Set(
      sesiones
        .filter((sesion) => sesion.idCurso === idCurso)
        .map((sesion) => sesion.idSesion),
    );
    const completados = participantes.filter(
      (fila) =>
        fila.idEmpleado === idEmpleado &&
        sesionesCurso.has(fila.idSesion) &&
        fila.estatusAsignacion === 'completado' &&
        fila.idParticipante != null,
    );
    for (const fila of completados) {
      const fecha = conclusiones.get(fila.idParticipante as number);
      if (fecha) return fecha;
    }
    return null;
  }

  private async persistir(
    companyId: number,
    planId: number,
    transicion: ReturnType<typeof decidirTransicion>,
    userId: number,
  ) {
    await this.prismaService.planCarreraColaborador.update({
      where: { idPlanCarrera: planId },
      data: {
        estatus: transicion.estatus as
          | 'en_preparacion'
          | 'listo_para_ascenso'
          | 'en_riesgo'
          | 'nominado'
          | 'promovido',
        ...(transicion.fechaListo ? { fechaListo: new Date() } : {}),
        ...(transicion.fechaRiesgo ? { fechaRiesgo: new Date() } : {}),
        ...(transicion.fechaLimiteRenovacion !== undefined
          ? {
              fechaLimiteRenovacion: transicion.fechaLimiteRenovacion
                ? diaPrisma(transicion.fechaLimiteRenovacion)
                : null,
              ...(transicion.fechaLimiteRenovacion === null
                ? { fechaRiesgo: null }
                : {}),
            }
          : {}),
      },
    });
    if (!transicion.accion) return;
    const textos: Record<string, string> = {
      LISTO: 'El plan quedó listo para ascenso.',
      RENOVADO: 'El curso se renovó y el plan volvió a listo para ascenso.',
      EN_RIESGO: 'Un curso obligatorio venció. Hay plazo para renovarlo.',
      REGRESO_PREPARACION:
        'Pasó el plazo de renovación y el plan volvió a preparación.',
    };
    await this.bitacora(
      companyId,
      userId,
      transicion.accion,
      'PlanCarreraColaborador',
      planId,
      textos[transicion.accion] ?? transicion.accion,
    );
  }

  private async plazasPorPuesto(
    companyId: number,
    puestos: number[],
  ): Promise<Map<number, PlazasPuesto>> {
    const mapa = new Map<number, PlazasPuesto>();
    if (puestos.length === 0) return mapa;
    const autorizadas = await this.prismaService.relPuestosUbicaciones.findMany(
      {
        where: { idPuesto: { in: puestos } },
        select: { idPuesto: true, idSite: true, PlazasAutorizadas: true },
      },
    );
    const ocupacion = await this.prismaService.empleados.groupBy({
      by: ['idPuesto', 'idSite'],
      where: {
        idEmpresa: companyId,
        activo: true,
        idPuesto: { in: puestos },
      },
      _count: { _all: true },
    });
    const siteIds = [
      ...new Set([
        ...(autorizadas ?? []).map((fila) => fila.idSite),
        ...ocupacion
          .map((fila) => fila.idSite)
          .filter((id): id is number => id != null),
      ]),
    ];
    const sites = siteIds.length
      ? await this.prismaService.catSites.findMany({
          where: { idSite: { in: siteIds } },
          select: { idSite: true, Descripcion: true },
        })
      : [];
    const nombres = new Map(
      (sites ?? []).map((site) => [site.idSite, site.Descripcion]),
    );
    for (const idPuesto of puestos) {
      mapa.set(
        idPuesto,
        desglosePlazas(
          (autorizadas ?? [])
            .filter((fila) => fila.idPuesto === idPuesto)
            .map((fila) => ({
              idSite: fila.idSite,
              autorizadas: fila.PlazasAutorizadas,
            })),
          ocupacion
            .filter((fila) => fila.idPuesto === idPuesto && fila.idSite != null)
            .map((fila) => ({
              idSite: fila.idSite as number,
              ocupadas: fila._count._all,
            })),
          nombres,
        ),
      );
    }
    return mapa;
  }

  private async conteoPersonas(companyId: number, puestos: number[]) {
    const mapa = new Map<number, number>();
    if (puestos.length === 0) return mapa;
    const filas = await this.prismaService.empleados.groupBy({
      by: ['idPuesto'],
      where: { idEmpresa: companyId, activo: true, idPuesto: { in: puestos } },
      _count: { _all: true },
    });
    for (const fila of filas) {
      if (fila.idPuesto != null) mapa.set(fila.idPuesto, fila._count._all);
    }
    return mapa;
  }

  private fichaDelMapa(
    ficha: FichaAprendizaje | null | undefined,
  ): { idRutaAprendizaje: number; nombre: string } | null {
    if (!ficha) return null;
    return {
      idRutaAprendizaje: ficha.idRutaAprendizaje,
      nombre: ficha.nombre,
    };
  }

  private async fichasAprendizaje(ids: number[]) {
    const mapa = new Map<number, FichaAprendizaje>();
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return mapa;
    const rutas = await this.prismaService.rutaAprendizaje.findMany({
      where: { idRutaAprendizaje: { in: unicos } },
      select: { idRutaAprendizaje: true, nombre: true },
    });
    const versiones = await this.prismaService.rutaVersion.findMany({
      where: { idRutaAprendizaje: { in: unicos }, estado: 'publicada' },
      select: { idVersion: true, idRutaAprendizaje: true, numero: true },
    });
    const publicada = new Map<number, { idVersion: number; numero: number }>();
    for (const version of versiones) {
      const actual = publicada.get(version.idRutaAprendizaje);
      if (!actual || version.numero > actual.numero) {
        publicada.set(version.idRutaAprendizaje, version);
      }
    }
    const versionIds = [...publicada.values()].map(
      (version) => version.idVersion,
    );
    const conteos = versionIds.length
      ? await this.prismaService.rutaElemento.groupBy({
          by: ['idVersion'],
          where: { idVersion: { in: versionIds } },
          _count: { _all: true },
        })
      : [];
    const cursosPorVersion = new Map(
      conteos.map((fila) => [fila.idVersion, fila._count._all]),
    );
    for (const ruta of rutas) {
      const version = publicada.get(ruta.idRutaAprendizaje);
      mapa.set(ruta.idRutaAprendizaje, {
        idRutaAprendizaje: ruta.idRutaAprendizaje,
        nombre: ruta.nombre,
        idVersion: version?.idVersion ?? null,
        numero: version?.numero ?? null,
        totalCursos: version
          ? (cursosPorVersion.get(version.idVersion) ?? 0)
          : 0,
      });
    }
    return mapa;
  }

  private async versionPublicada(
    idRutaAprendizaje: number | null | undefined,
  ): Promise<number | null> {
    if (idRutaAprendizaje == null) return null;
    const version = await this.prismaService.rutaVersion.findFirst({
      where: { idRutaAprendizaje, estado: 'publicada' },
      orderBy: { numero: 'desc' },
      select: { idVersion: true },
    });
    return version?.idVersion ?? null;
  }

  private async tipoDePuestos(
    companyId: number,
    idPuestoOrigen: number,
    idPuestoDestino: number,
  ) {
    const puestos = await this.prismaService.catPuestos.findMany({
      where: {
        idEmpresa: companyId,
        idPuesto: { in: [idPuestoOrigen, idPuestoDestino] },
        Activo: true,
        aprobada: true,
      },
    });
    const encontrados = new Set(puestos.map((puesto) => puesto.idPuesto));
    const faltantes = [idPuestoOrigen, idPuestoDestino].filter(
      (id) => !encontrados.has(id),
    );
    if (faltantes.length > 0) {
      throw new BadRequestException(
        `Puesto(s) no encontrado(s), inactivo(s) o no aprobado(s) en la empresa: ${faltantes.join(', ')}`,
      );
    }
    const nivel = (id: number) =>
      puestos.find((puesto) => puesto.idPuesto === id)?.IdNivelSalario ?? null;
    const origen = nivel(idPuestoOrigen);
    const destino = nivel(idPuestoDestino);
    if (origen == null || destino == null) {
      throw new BadRequestException(
        'Asigna un nivel salarial a los dos puestos para saber si el camino es ascenso o lateral.',
      );
    }
    const tipo = tipoDeNiveles(origen, destino);
    if (tipo === 'menor') {
      throw new BadRequestException(
        'El puesto destino tiene un nivel salarial menor que el origen.',
      );
    }
    return tipo;
  }

  private extraRuta(
    dto: {
      antiguedadMinimaMeses?: number | null;
      idRutaAprendizaje?: number | null;
    },
    tipo: 'ascenso' | 'lateral',
  ) {
    return {
      tipo,
      ...(dto.antiguedadMinimaMeses !== undefined
        ? { antiguedadMinimaMeses: dto.antiguedadMinimaMeses }
        : {}),
      ...(dto.idRutaAprendizaje !== undefined
        ? { idRutaAprendizaje: dto.idRutaAprendizaje }
        : {}),
    };
  }

  private async exigirRutaAprendizaje(
    companyId: number,
    idRutaAprendizaje: number,
  ) {
    const ruta = await this.prismaService.rutaAprendizaje.findFirst({
      where: { idRutaAprendizaje, idEmpresa: companyId, activo: true },
      select: { idRutaAprendizaje: true },
    });
    if (!ruta) {
      throw new BadRequestException(
        'La ruta de aprendizaje no existe o no está activa en la empresa.',
      );
    }
  }

  private async nombreTipoMovimiento(lateral: boolean): Promise<string> {
    const tipos = await this.prismaService.catTipoMovimiento.findMany({
      where: { activo: true, idModuloFlujo: 2 },
      select: { nombre: true },
    });
    const normal = (nombre: string) =>
      nombre.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    if (!lateral) {
      const promo = tipos.find((tipo) => normal(tipo.nombre) === 'promocion');
      if (!promo) {
        throw new BadRequestException(
          'No existe el tipo de movimiento Promoción.',
        );
      }
      return promo.nombre;
    }
    const puesto = tipos.find((tipo) => {
      const nombre = normal(tipo.nombre);
      return nombre.includes('puesto') && nombre !== 'promocion';
    });
    if (puesto) return puesto.nombre;
    const area = tipos.find((tipo) => normal(tipo.nombre) === 'cambio de area');
    if (area) return area.nombre;
    throw new BadRequestException(
      'No existe un tipo de movimiento de cambio de puesto.',
    );
  }

  private async actorDe(
    companyId: number,
    user: ActiveUserDto,
  ): Promise<Actor> {
    const empleado = await this.prismaService.empleados.findFirst({
      where: {
        idUsuario: user.uuid,
        idEmpresa: companyId,
        activo: true,
        ...(user.idTenant ? { idTenant: user.idTenant } : {}),
      },
      select: { idEmpleado: true },
    });
    const roles = await this.prismaService.relUsuarioRol.findMany({
      where: { idUsuario: user.id, activo: true },
      select: { idRol: true },
    });
    if (roles.length === 0) {
      return { rh: false, idEmpleado: empleado?.idEmpleado ?? null };
    }
    const permiso = await this.prismaService.relRolPermisos.findFirst({
      where: {
        idRol: { in: roles.map((rol) => rol.idRol) },
        activo: true,
        puedeCrear: true,
        CatModulos: { Codigo: MODULO },
      },
      select: { id: true },
    });
    return { rh: !!permiso, idEmpleado: empleado?.idEmpleado ?? null };
  }

  private async exigirOrigen(
    companyId: number,
    idJefeInmediato: number | null,
    user: ActiveUserDto,
  ): Promise<'rh' | 'jefe'> {
    const actor = await this.actorDe(companyId, user);
    if (actor.idEmpleado != null && idJefeInmediato === actor.idEmpleado) {
      return 'jefe';
    }
    if (actor.rh) return 'rh';
    throw new ForbiddenException(
      'Solo RH o el jefe inmediato pueden postular o nominar a este colaborador.',
    );
  }

  private cubre(actor: Actor, idJefeInmediato: number | null): boolean {
    if (actor.rh) return true;
    return actor.idEmpleado != null && idJefeInmediato === actor.idEmpleado;
  }

  private async planesDe(companyId: number, idEmpleado: number) {
    const routes = await this.prismaService.relPuestoRuta.findMany({
      where: { idEmpresa: companyId },
      select: { idRuta: true },
    });
    if (routes.length === 0) return [];
    return this.prismaService.planCarreraColaborador.findMany({
      where: { idEmpleado, idRuta: { in: routes.map((ruta) => ruta.idRuta) } },
      orderBy: { fechaInscripcion: 'asc' },
    });
  }

  private async historialDe(companyId: number, planId: number) {
    const filas = await this.prismaService.historicoMovimientos.findMany({
      where: {
        idEmpresa: companyId,
        tablaOrigen: 'PlanCarreraColaborador',
        idRegistro: String(planId),
      },
      orderBy: { fechaCreacion: 'asc' },
    });
    return (filas ?? []).map((fila) => ({
      tipo: TIPO_BITACORA[fila.accion] ?? fila.accion.toLowerCase(),
      fecha: fila.fechaCreacion,
      descripcion: fila.descripcion,
    }));
  }

  private async bitacora(
    companyId: number,
    userId: number,
    accion: string,
    tabla: string,
    idRegistro: number,
    descripcion: string,
  ) {
    await this.prismaService.historicoMovimientos.create({
      data: {
        idUsuario: userId,
        idEmpresa: companyId,
        accion,
        tablaOrigen: tabla,
        idRegistro: String(idRegistro),
        descripcion,
        fechaCreacion: new Date(),
      },
    });
  }

  private async nombresDeSites(
    ids: Array<number | null | undefined>,
  ): Promise<Map<number, string>> {
    const unicos = [...new Set(ids.filter((id): id is number => id != null))];
    if (unicos.length === 0) return new Map();
    const sites = await this.prismaService.catSites.findMany({
      where: { idSite: { in: unicos } },
      select: { idSite: true, Descripcion: true },
    });
    return new Map(
      sites
        .filter((site) => site.Descripcion?.trim())
        .map((site) => [site.idSite, site.Descripcion.trim()]),
    );
  }

  private async zonaDe(companyId: number): Promise<string> {
    const principal = await this.prismaService.catSites.findFirst({
      where: { idEmpresa: companyId, EsPrincipal: true },
      select: { zonaHoraria: true },
    });
    if (principal?.zonaHoraria) return zonaValida(principal.zonaHoraria);
    const sitio = await this.prismaService.catSites.findFirst({
      where: { idEmpresa: companyId },
      select: { zonaHoraria: true },
    });
    return zonaValida(sitio?.zonaHoraria || ZONA);
  }

  private async hoyEmpresa(companyId: number): Promise<string> {
    return localDateString(new Date(), await this.zonaDe(companyId));
  }

  private kpisVacios() {
    return {
      enPlan: 0,
      listosAhora: 0,
      enRiesgo: 0,
      nominados: 0,
      promovidosEsteAnio: 0,
    };
  }

  private kpisDe(
    filas: {
      estatus: string;
      nivelPreparacion: string;
      fechaPromocion: Date | null;
    }[],
    hoy: string,
  ) {
    const anio = hoy.slice(0, 4);
    return {
      enPlan: filas.filter(
        (fila) => fila.estatus !== 'promovido' && fila.estatus !== 'cancelado',
      ).length,
      listosAhora: filas.filter(
        (fila) =>
          fila.estatus === 'listo_para_ascenso' &&
          fila.nivelPreparacion === 'listo_ahora',
      ).length,
      enRiesgo: filas.filter((fila) => fila.estatus === 'en_riesgo').length,
      nominados: filas.filter((fila) => fila.estatus === 'nominado').length,
      promovidosEsteAnio: filas.filter((fila) => {
        if (fila.estatus !== 'promovido' || !fila.fechaPromocion) return false;
        return localDateString(fila.fechaPromocion, ZONA).slice(0, 4) === anio;
      }).length,
    };
  }
}

function cursoVencidoDe(cursos: CursoEvaluado[]): {
  idCurso: number;
  nombre: string;
  idSesion: number | null;
} | null {
  const vencido = cursos.find((curso) => curso.vencido);
  if (!vencido) return null;
  return {
    idCurso: vencido.idCurso,
    nombre: vencido.nombre || '',
    idSesion: vencido.idSesion,
  };
}

function requisitosMovil(
  requisitos: RequisitoEvaluado[],
  cursos: CursoEvaluado[],
): {
  tipo: string;
  titulo: string;
  detalle: string;
  estado: 'cumplido' | 'en_progreso' | 'pendiente' | 'proximamente' | 'vencido';
}[] {
  const porCurso = new Map(cursos.map((curso) => [curso.idCurso, curso]));
  return requisitos.map((requisito) => {
    const id = requisito.clave.startsWith('curso:')
      ? Number(requisito.clave.slice(6))
      : null;
    const curso =
      id != null && Number.isInteger(id) ? porCurso.get(id) : undefined;
    return {
      tipo: requisito.tipo,
      titulo: requisito.nombre?.trim() || tituloRequisito(requisito.tipo),
      detalle: detalleRequisito(requisito, curso),
      estado: estadoRequisito(requisito, curso),
    };
  });
}

function tituloRequisito(tipo: string): string {
  if (tipo === 'antiguedad') return 'Antigüedad en el puesto';
  if (tipo === 'plaza') return 'Plaza autorizada libre';
  if (tipo === 'evaluacion_jefe') return 'Evaluación del jefe';
  return 'Curso';
}

function estadoRequisito(
  requisito: RequisitoEvaluado,
  curso: CursoEvaluado | undefined,
): 'cumplido' | 'en_progreso' | 'pendiente' | 'proximamente' | 'vencido' {
  if (
    requisito.tipo === 'evaluacion_jefe' ||
    requisito.estado === 'pendiente_fase_3'
  ) {
    return 'proximamente';
  }
  if (curso?.vencido && !curso.cumplido) return 'vencido';
  if (requisito.estado === 'cumplido' || curso?.cumplido) return 'cumplido';
  if (curso?.estatus === 'en_curso' || curso?.estatus === 'reprobado') {
    return 'en_progreso';
  }
  const meses = requisito.detalle?.meses ?? 0;
  if (requisito.tipo === 'antiguedad' && meses > 0) return 'en_progreso';
  return 'pendiente';
}

function detalleRequisito(
  requisito: RequisitoEvaluado,
  curso: CursoEvaluado | undefined,
): string {
  if (requisito.tipo === 'evaluacion_jefe') {
    return 'Disponible en una siguiente versión';
  }
  if (requisito.tipo === 'antiguedad') {
    const meses = requisito.detalle?.meses ?? 0;
    const requeridos = requisito.detalle?.requeridos ?? 0;
    return requisito.estado === 'cumplido'
      ? `${meses} meses en el puesto`
      : `${meses} de ${requeridos} meses`;
  }
  if (requisito.tipo === 'plaza') {
    return requisito.estado === 'cumplido'
      ? 'Hay plaza en tu site'
      : 'Sin plaza en tu site';
  }
  if (curso?.vencido) {
    return curso.vence ? `Venció el ${curso.vence}` : 'Venció';
  }
  if (curso?.cumplido) {
    return curso.calificacion != null
      ? `Calificación ${curso.calificacion}`
      : 'Vigente';
  }
  if (curso?.estatus === 'en_curso') return 'En curso';
  return 'Pendiente';
}

function aIso(fecha: Date | null | undefined): string | null {
  if (!fecha) return null;
  const valor = new Date(fecha);
  return Number.isNaN(valor.getTime()) ? null : valor.toISOString();
}
