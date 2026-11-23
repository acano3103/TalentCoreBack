import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreateRouteDto } from './dto/create-route.dto';
import { CreatePostulacionDto } from './dto/create-postulacion.dto';
import {
  PLAN_CARRERA_TIPO_CURSO,
  CALIFICACION_APROBATORIA,
} from './career-plan.constants';
import { evaluarCursos, resolverUmbralAprobatorio } from './career-plan.avance';
import type { PlanCarreraEstatus } from 'generated/prisma/enums';

@Injectable()
export class CareerPlanService {
  private readonly logger = new Logger(CareerPlanService.name);

  constructor(private prismaService: PrismaService) {}

  // Obtiene las rutas de crecimiento activas de la empresa, con malla de cursos y
  // total de colaboradores postulados por ruta
  async findRoutes(companyId: number) {
    const routes = await this.prismaService.relPuestoRuta.findMany({
      where: { idEmpresa: companyId, activo: true },
      orderBy: { fechaRegistro: 'asc' },
    });

    if (routes.length === 0) {
      return [];
    }

    // Puestos involucrados (origen y destino) para resolver nombres
    const puestoIds = [
      ...new Set(routes.flatMap((r) => [r.idPuestoOrigen, r.idPuestoDestino])),
    ];
    const puestos = await this.prismaService.catPuestos.findMany({
      where: { idPuesto: { in: puestoIds } },
      select: { idPuesto: true, NombrePuesto: true },
    });
    const puestoMap = new Map(puestos.map((p) => [p.idPuesto, p.NombrePuesto]));

    // Malla de cursos Plan de Carrera de cada puesto destino
    const destinoIds = [...new Set(routes.map((r) => r.idPuestoDestino))];
    const rel = await this.prismaService.relPuestoCurso.findMany({
      where: {
        idPuesto: { in: destinoIds },
        idTipoCurso: PLAN_CARRERA_TIPO_CURSO,
        activo: true,
      },
    });
    const cursoIds = [...new Set(rel.map((c) => c.idCurso))];
    const cursos = cursoIds.length
      ? await this.prismaService.catCursos.findMany({
          where: { idCursos: { in: cursoIds } },
          select: { idCursos: true, Descripcion: true },
        })
      : [];
    const cursoMap = new Map(cursos.map((c) => [c.idCursos, c.Descripcion]));

    // Total de colaboradores por ruta
    const agrupados = await this.prismaService.planCarreraColaborador.groupBy({
      by: ['idRuta'],
      where: { idRuta: { in: routes.map((r) => r.idRuta) } },
      _count: { _all: true },
    });
    const countMap = new Map(agrupados.map((a) => [a.idRuta, a._count._all]));

    return routes.map((route) => {
      const malla = rel
        .filter((c) => c.idPuesto === route.idPuestoDestino)
        .map((c) => ({
          idCurso: c.idCurso,
          descripcion: cursoMap.get(c.idCurso) || null,
        }));

      return {
        idRuta: route.idRuta,
        idPuestoOrigen: route.idPuestoOrigen,
        idPuestoDestino: route.idPuestoDestino,
        puestoOrigen: puestoMap.get(route.idPuestoOrigen) || null,
        puestoDestino: puestoMap.get(route.idPuestoDestino) || null,
        cursos: malla,
        totalColaboradores: countMap.get(route.idRuta) || 0,
        fechaRegistro: route.fechaRegistro,
      };
    });
  }

  // Crea una ruta de crecimiento validando origen != destino, puestos activos y sin duplicados
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

    // Verificar que ambos puestos existan y esten activos en la empresa
    const puestos = await this.prismaService.catPuestos.findMany({
      where: {
        idEmpresa: companyId,
        idPuesto: { in: [idPuestoOrigen, idPuestoDestino] },
        Activo: true,
        aprobada: true,
      },
    });
    const encontrados = new Set(puestos.map((p) => p.idPuesto));
    const faltantes = [idPuestoOrigen, idPuestoDestino].filter(
      (id) => !encontrados.has(id),
    );
    if (faltantes.length > 0) {
      throw new BadRequestException(
        `Puesto(s) no encontrado(s), inactivo(s) o no aprobado(s) en la empresa: ${faltantes.join(', ')}`,
      );
    }

    // Validar duplicados (incluye rutas desactivadas para poder reactivar en vez de fallar)
    const existente = await this.prismaService.relPuestoRuta.findFirst({
      where: { idEmpresa: companyId, idPuestoOrigen, idPuestoDestino },
    });
    if (existente?.activo) {
      throw new BadRequestException('La ruta entre estos puestos ya existe');
    }
    if (existente) {
      // Ruta desactivada: se reactiva
      const ruta = await this.prismaService.relPuestoRuta.update({
        where: { idRuta: existente.idRuta },
        data: { activo: true, usuarioRegistro: user.uuid },
      });
      await this.prismaService.historicoMovimientos.create({
        data: {
          idUsuario: user.id,
          idEmpresa: companyId,
          accion: 'REACTIVAR',
          tablaOrigen: 'RelPuestoRuta',
          idRegistro: String(ruta.idRuta),
          descripcion: `Ruta de carrera reactivada por ${user.first_name} ${user.last_name}`,
          fechaCreacion: new Date(),
        },
      });
      return ruta;
    }

    // Crear la ruta
    const ruta = await this.prismaService.relPuestoRuta.create({
      data: {
        idEmpresa: companyId,
        idPuestoOrigen,
        idPuestoDestino,
        activo: true,
        usuarioRegistro: user.uuid,
      },
    });

    await this.prismaService.historicoMovimientos.create({
      data: {
        idUsuario: user.id,
        idEmpresa: companyId,
        accion: 'CREATE',
        tablaOrigen: 'RelPuestoRuta',
        idRegistro: String(ruta.idRuta),
        descripcion: `Ruta de carrera creada (puesto ${idPuestoOrigen} -> ${idPuestoDestino}) por ${user.first_name} ${user.last_name}`,
        fechaCreacion: new Date(),
      },
    });

    return ruta;
  }

  // Desactiva una ruta (soft delete, activo = false)
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

    await this.prismaService.historicoMovimientos.create({
      data: {
        idUsuario: user.id,
        idEmpresa: companyId,
        accion: 'DESACTIVAR',
        tablaOrigen: 'RelPuestoRuta',
        idRegistro: String(routeId),
        descripcion: `Ruta de carrera desactivada por ${user.first_name} ${user.last_name}`,
        fechaCreacion: new Date(),
      },
    });

    return { message: 'Ruta desactivada correctamente' };
  }

  // Obtiene la malla de cursos Plan de Carrera (idTipoCurso = 3) del puesto destino de una ruta
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

    const cursoIds = [...new Set(rel.map((c) => c.idCurso))];
    const cursos = cursoIds.length
      ? await this.prismaService.catCursos.findMany({
          where: { idCursos: { in: cursoIds } },
          include: {
            CatTipoCurso: { select: { idTipoCurso: true, Descripcion: true } },
          },
        })
      : [];

    const cursoMap = new Map(cursos.map((c) => [c.idCursos, c]));

    return {
      idRuta: route.idRuta,
      idPuestoDestino: route.idPuestoDestino,
      cursos: rel.map((c) => {
        const curso = cursoMap.get(c.idCurso);
        return {
          idCurso: c.idCurso,
          descripcion: curso?.Descripcion || null,
          tipo: curso?.CatTipoCurso?.Descripcion || null,
          idTipoCurso: c.idTipoCurso,
        };
      }),
    };
  }

  // Umbral en escala 0-100. Sin configurar es 70; un valor <= 10 se lee como escala 0-10.
  private async obtenerUmbralAprobatorio(companyId: number): Promise<number> {
    const config = await this.prismaService.configuracionEmpresa.findUnique({
      where: {
        idEmpresa_clave: {
          idEmpresa: companyId,
          clave: CALIFICACION_APROBATORIA,
        },
      },
    });
    return resolverUmbralAprobatorio(config?.valor, companyId, this.logger);
  }

  // Al 100 % un plan en preparación pasa a listo para ascenso. No revierte un estatus posterior.
  private async cerrarSiCompleto(
    plan: { idPlanCarrera: number; estatus: string },
    avance: { total: number; porcentaje: number },
  ): Promise<string> {
    if (
      plan.estatus === 'en_preparacion' &&
      avance.total > 0 &&
      avance.porcentaje >= 100
    ) {
      await this.prismaService.planCarreraColaborador.update({
        where: { idPlanCarrera: plan.idPlanCarrera },
        data: { estatus: 'listo_para_ascenso' as PlanCarreraEstatus },
      });
      return 'listo_para_ascenso';
    }
    return plan.estatus;
  }

  // Obtiene las postulaciones con % de avance calculado contra la malla del puesto objetivo
  // (evalua y deriva automaticamente el estatus listo_para_ascenso al 100%)
  async findColaboradores(companyId: number) {
    const routes = await this.prismaService.relPuestoRuta.findMany({
      where: { idEmpresa: companyId },
      select: { idRuta: true },
    });
    if (routes.length === 0) return [];
    const routeIds = routes.map((r) => r.idRuta);

    const postulaciones =
      await this.prismaService.planCarreraColaborador.findMany({
        where: { idRuta: { in: routeIds } },
        orderBy: { fechaInscripcion: 'asc' },
      });
    if (postulaciones.length === 0) return [];

    const empleadoIds = [...new Set(postulaciones.map((p) => p.idEmpleado))];
    const empleados = await this.prismaService.empleados.findMany({
      where: { idEmpleado: { in: empleadoIds } },
      select: {
        idEmpleado: true,
        nombre: true,
        primerApellido: true,
        segundoApellido: true,
        idPuesto: true,
        correo: true,
      },
    });
    const empMap = new Map(empleados.map((e) => [e.idEmpleado, e]));
    const avances = await this.evaluarPostulaciones(companyId, postulaciones);

    return avances.map((avance) => {
      const p = avance.plan;
      const emp = empMap.get(p.idEmpleado);
      return {
        idPlanCarrera: p.idPlanCarrera,
        idEmpleado: p.idEmpleado,
        nombreEmpleado: emp
          ? `${emp.nombre ?? ''} ${emp.primerApellido ?? ''} ${emp.segundoApellido ?? ''}`.trim()
          : null,
        correo: emp?.correo ?? null,
        idRuta: p.idRuta,
        idPuestoActual: p.idPuestoActual,
        idPuestoObjetivo: p.idPuestoObjetivo,
        puestoActual: avance.puestoActual,
        puestoObjetivo: avance.puestoObjetivo,
        estatus: avance.estatus,
        totalCursos: avance.total,
        cursosAprobados: avance.aprobados,
        porcentajeAvance: avance.porcentaje,
        fechaInscripcion: p.fechaInscripcion,
        fechaPromocion: p.fechaPromocion,
      };
    });
  }

  // Planes del empleado logueado. La app solo consulta: no crea postulaciones.
  async findPlanesEmpleado(companyId: number, idEmpleado: number) {
    const postulaciones = await this.planesDe(companyId, idEmpleado);
    if (postulaciones.length === 0) return { planes: [] };

    const avances = await this.evaluarPostulaciones(companyId, postulaciones);
    return {
      planes: avances.map((avance) => ({
        idPlanCarrera: avance.plan.idPlanCarrera,
        estatus: avance.estatus as
          'en_preparacion' | 'listo_para_ascenso' | 'promovido',
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
      })),
    };
  }

  // Tarjeta del summary: el plan en curso, o el único que tenga.
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

  private async planesDe(companyId: number, idEmpleado: number) {
    const routes = await this.prismaService.relPuestoRuta.findMany({
      where: { idEmpresa: companyId },
      select: { idRuta: true },
    });
    if (routes.length === 0) return [];
    return this.prismaService.planCarreraColaborador.findMany({
      where: { idEmpleado, idRuta: { in: routes.map((r) => r.idRuta) } },
      orderBy: { fechaInscripcion: 'asc' },
    });
  }

  private async evaluarPostulaciones<
    T extends {
      idPlanCarrera: number;
      idEmpleado: number;
      idRuta: number;
      idPuestoActual: number;
      idPuestoObjetivo: number;
      estatus: string;
      fechaInscripcion: Date | null;
      fechaPromocion: Date | null;
    },
  >(companyId: number, postulaciones: T[]) {
    const umbral = await this.obtenerUmbralAprobatorio(companyId);
    const puestoIds = [
      ...new Set(
        postulaciones.flatMap((p) => [p.idPuestoActual, p.idPuestoObjetivo]),
      ),
    ];
    const puestos = await this.prismaService.catPuestos.findMany({
      where: { idPuesto: { in: puestoIds } },
      select: { idPuesto: true, NombrePuesto: true },
    });
    const puestoMap = new Map(puestos.map((p) => [p.idPuesto, p.NombrePuesto]));

    const objetivoIds = [
      ...new Set(postulaciones.map((p) => p.idPuestoObjetivo)),
    ];
    const rel = await this.prismaService.relPuestoCurso.findMany({
      where: {
        idPuesto: { in: objetivoIds },
        idTipoCurso: PLAN_CARRERA_TIPO_CURSO,
        activo: true,
      },
    });
    const mallaPorPuesto = new Map<number, number[]>();
    for (const fila of rel) {
      const lista = mallaPorPuesto.get(fila.idPuesto) ?? [];
      lista.push(fila.idCurso);
      mallaPorPuesto.set(fila.idPuesto, lista);
    }

    const mallaCursoIds = [...new Set(rel.map((fila) => fila.idCurso))];
    const cursos = mallaCursoIds.length
      ? await this.prismaService.catCursos.findMany({
          where: { idCursos: { in: mallaCursoIds } },
          select: { idCursos: true, Descripcion: true },
        })
      : [];
    const cursoMap = new Map(
      cursos.map((curso) => [curso.idCursos, curso.Descripcion]),
    );
    const sesiones = mallaCursoIds.length
      ? await this.prismaService.cursoSesiones.findMany({
          where: { idCurso: { in: mallaCursoIds } },
          select: { idSesion: true, idCurso: true, fechaInicioPeriodo: true },
        })
      : [];
    const sesionIds = sesiones.map((sesion) => sesion.idSesion);
    const empleadoIds = [...new Set(postulaciones.map((p) => p.idEmpleado))];
    const participantes = sesionIds.length
      ? await this.prismaService.cursoParticipantes.findMany({
          where: {
            idEmpleado: { in: empleadoIds },
            idSesion: { in: sesionIds },
          },
        })
      : [];

    return Promise.all(
      postulaciones.map(async (plan) => {
        const avance = evaluarCursos(
          plan.idEmpleado,
          mallaPorPuesto.get(plan.idPuestoObjetivo) ?? [],
          sesiones,
          participantes,
          umbral,
        );
        const estatus = await this.cerrarSiCompleto(plan, avance);
        return {
          plan,
          estatus,
          total: avance.total,
          aprobados: avance.aprobados,
          porcentaje: avance.porcentaje,
          puestoActual: puestoMap.get(plan.idPuestoActual) || null,
          puestoObjetivo: puestoMap.get(plan.idPuestoObjetivo) || null,
          cursos: avance.cursos.map((curso) => ({
            ...curso,
            nombre: cursoMap.get(curso.idCurso) ?? null,
          })),
        };
      }),
    );
  }

  // Postula a un colaborador a una ruta con snapshots de puestos
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

    const existente = await this.prismaService.planCarreraColaborador.findFirst(
      {
        where: { idEmpleado, idRuta },
      },
    );
    if (existente) {
      throw new BadRequestException(
        'El colaborador ya está postulado a esta ruta',
      );
    }

    const plan = await this.prismaService.planCarreraColaborador.create({
      data: {
        idEmpleado,
        idRuta,
        idPuestoActual: empleado.idPuesto,
        idPuestoObjetivo: route.idPuestoDestino,
        estatus: 'en_preparacion',
        usuarioRegistro: user.uuid,
      },
    });

    await this.prismaService.historicoMovimientos.create({
      data: {
        idUsuario: user.id,
        idEmpresa: companyId,
        accion: 'POSTULAR',
        tablaOrigen: 'PlanCarreraColaborador',
        idRegistro: String(plan.idPlanCarrera),
        descripcion: `Colaborador ${idEmpleado} postulado a la ruta (puesto ${route.idPuestoOrigen} -> ${route.idPuestoDestino}) por ${user.first_name} ${user.last_name}`,
        fechaCreacion: new Date(),
      },
    });

    this.logger.log(
      `Postulacion creada: plan=${plan.idPlanCarrera} empleado=${idEmpleado} ruta=${idRuta}`,
    );
    return plan;
  }

  // Obtiene el detalle de una postulacion: tabla curso por curso
  async findColaborador(companyId: number, planId: number) {
    const postulacion =
      await this.prismaService.planCarreraColaborador.findUnique({
        where: { idPlanCarrera: planId },
      });
    if (!postulacion) {
      throw new NotFoundException('Postulación no encontrada');
    }

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

    const rel = await this.prismaService.relPuestoCurso.findMany({
      where: {
        idPuesto: postulacion.idPuestoObjetivo,
        idTipoCurso: PLAN_CARRERA_TIPO_CURSO,
        activo: true,
      },
    });
    const cursoIds = rel.map((r) => r.idCurso);

    const cursos = cursoIds.length
      ? await this.prismaService.catCursos.findMany({
          where: { idCursos: { in: cursoIds } },
          include: {
            CatTipoCurso: { select: { idTipoCurso: true, Descripcion: true } },
          },
        })
      : [];
    const cursoMap = new Map(cursos.map((c) => [c.idCursos, c]));

    const sesiones = cursoIds.length
      ? await this.prismaService.cursoSesiones.findMany({
          where: { idCurso: { in: cursoIds } },
          select: { idSesion: true, idCurso: true, fechaInicioPeriodo: true },
        })
      : [];
    const sesionIds = sesiones.map((s) => s.idSesion);

    const participantes = sesionIds.length
      ? await this.prismaService.cursoParticipantes.findMany({
          where: {
            idEmpleado: postulacion.idEmpleado,
            idSesion: { in: sesionIds },
          },
        })
      : [];

    const umbral = await this.obtenerUmbralAprobatorio(companyId);
    const avance = evaluarCursos(
      postulacion.idEmpleado,
      cursoIds,
      sesiones,
      participantes,
      umbral,
    );
    const estatus = await this.cerrarSiCompleto(postulacion, avance);
    const cursosDetalle = avance.cursos.map((cursoEval) => {
      const curso = cursoMap.get(cursoEval.idCurso);
      return {
        idCurso: cursoEval.idCurso,
        descripcion: curso?.Descripcion || null,
        tipo: curso?.CatTipoCurso?.Descripcion || null,
        estatus: cursoEval.estatus,
        calificacion: cursoEval.calificacion,
        aprobado: cursoEval.aprobado,
      };
    });
    const porcentaje = avance.porcentaje;

    const puestoActual = await this.prismaService.catPuestos.findUnique({
      where: { idPuesto: postulacion.idPuestoActual },
      select: { NombrePuesto: true },
    });
    const puestoObjetivo = await this.prismaService.catPuestos.findUnique({
      where: { idPuesto: postulacion.idPuestoObjetivo },
      select: { NombrePuesto: true },
    });

    return {
      idPlanCarrera: postulacion.idPlanCarrera,
      idEmpleado: postulacion.idEmpleado,
      nombreEmpleado:
        `${empleado.nombre ?? ''} ${empleado.primerApellido ?? ''} ${empleado.segundoApellido ?? ''}`.trim(),
      idRuta: postulacion.idRuta,
      idPuestoActual: postulacion.idPuestoActual,
      idPuestoObjetivo: postulacion.idPuestoObjetivo,
      puestoActual: puestoActual?.NombrePuesto || null,
      puestoObjetivo: puestoObjetivo?.NombrePuesto || null,
      estatus,
      porcentajeAvance: porcentaje,
      cursos: cursosDetalle,
    };
  }
}

function aIso(fecha: Date | null | undefined): string | null {
  if (!fecha) return null;
  const valor = new Date(fecha);
  return Number.isNaN(valor.getTime()) ? null : valor.toISOString();
}
