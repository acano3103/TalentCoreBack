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
import type { CursoParticipantes } from 'generated/prisma/client';
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

  // Umbral aprobatorio dinamico por empresa (ConfiguracionEmpresa), default 8
  private async obtenerUmbralAprobatorio(companyId: number): Promise<number> {
    const config = await this.prismaService.configuracionEmpresa.findUnique({
      where: {
        idEmpresa_clave: {
          idEmpresa: companyId,
          clave: CALIFICACION_APROBATORIA,
        },
      },
    });
    const valor = Number(config?.valor ?? 8);
    return Number.isFinite(valor) ? valor : 8;
  }

  // Evalua el avance de una postulacion contra la malla del puesto objetivo
  // y deriva automaticamente el estatus listo_para_ascenso al alcanzar el 100%
  private async evaluarAvance(
    companyId: number,
    plan: {
      idPlanCarrera: number;
      idEmpleado: number;
      idPuestoObjetivo: number;
      estatus: string;
    },
    participantes: CursoParticipantes[],
    sesionCursoMap: Map<number, number>,
    mallaPorPuesto: Map<number, number[]>,
  ) {
    const umbral = await this.obtenerUmbralAprobatorio(companyId);
    const malla = mallaPorPuesto.get(plan.idPuestoObjetivo) || [];
    const total = malla.length;

    let aprobados = 0;
    for (const part of participantes) {
      if (part.idEmpleado !== plan.idEmpleado) continue;
      const cursoId = sesionCursoMap.get(part.idSesion);
      if (cursoId === undefined || !malla.includes(cursoId)) continue;
      const aprobado =
        part.estatusAsignacion === 'completado' &&
        (part.calificacionFinal === null ||
          Number(part.calificacionFinal) >= umbral);
      if (aprobado) aprobados++;
    }

    const porcentaje = total === 0 ? 0 : Math.round((aprobados / total) * 100);

    let estatus = plan.estatus;
    if (plan.estatus === 'en_preparacion' && total > 0 && porcentaje >= 100) {
      estatus = 'listo_para_ascenso';
      await this.prismaService.planCarreraColaborador.update({
        where: { idPlanCarrera: plan.idPlanCarrera },
        data: { estatus: estatus as PlanCarreraEstatus },
      });
    }

    return { total, aprobados, porcentaje, estatus };
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
    for (const r of rel) {
      if (!mallaPorPuesto.has(r.idPuesto)) mallaPorPuesto.set(r.idPuesto, []);
      mallaPorPuesto.get(r.idPuesto)!.push(r.idCurso);
    }

    const mallaCursoIds = [...new Set(rel.map((r) => r.idCurso))];
    const sesiones = mallaCursoIds.length
      ? await this.prismaService.cursoSesiones.findMany({
          where: { idCurso: { in: mallaCursoIds } },
          select: { idSesion: true, idCurso: true },
        })
      : [];
    const sesionCursoMap = new Map(
      sesiones.map((s) => [s.idSesion, s.idCurso]),
    );
    const sesionIds = sesiones.map((s) => s.idSesion);

    const participantes = sesionIds.length
      ? await this.prismaService.cursoParticipantes.findMany({
          where: {
            idEmpleado: { in: empleadoIds },
            idSesion: { in: sesionIds },
          },
        })
      : [];

    const resultados = postulaciones.map(async (p) => {
      const emp = empMap.get(p.idEmpleado);
      const avance = await this.evaluarAvance(
        companyId,
        p,
        participantes,
        sesionCursoMap,
        mallaPorPuesto,
      );
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
        puestoActual: puestoMap.get(p.idPuestoActual) || null,
        puestoObjetivo: puestoMap.get(p.idPuestoObjetivo) || null,
        estatus: avance.estatus,
        totalCursos: avance.total,
        cursosAprobados: avance.aprobados,
        porcentajeAvance: avance.porcentaje,
        fechaInscripcion: p.fechaInscripcion,
        fechaPromocion: p.fechaPromocion,
      };
    });

    return Promise.all(resultados);
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
          select: { idSesion: true, idCurso: true },
        })
      : [];
    const sesionCursoMap = new Map(
      sesiones.map((s) => [s.idSesion, s.idCurso]),
    );
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
    const prioridad: Record<string, number> = {
      inscrito: 0,
      no_asistio: 0,
      reprobado: 1,
      completado: 2,
    };

    const mejorPorCurso = new Map<
      number,
      { part: CursoParticipantes; prioridad: number }
    >();
    for (const part of participantes) {
      const cursoId = sesionCursoMap.get(part.idSesion);
      if (cursoId === undefined) continue;
      const prior = prioridad[part.estatusAsignacion ?? 'inscrito'] ?? 0;
      const actual = mejorPorCurso.get(cursoId);
      if (!actual || prior > actual.prioridad) {
        mejorPorCurso.set(cursoId, { part, prioridad: prior });
      }
    }

    const cursosDetalle = rel.map((r) => {
      const curso = cursoMap.get(r.idCurso);
      const reg = mejorPorCurso.get(r.idCurso);
      const estatus = !reg
        ? 'pendiente'
        : reg.part.estatusAsignacion === 'completado'
          ? 'completado'
          : reg.part.estatusAsignacion === 'reprobado'
            ? 'reprobado'
            : 'en_curso';
      const calificacion =
        reg?.part.calificacionFinal != null
          ? Number(reg.part.calificacionFinal)
          : null;
      return {
        idCurso: r.idCurso,
        descripcion: curso?.Descripcion || null,
        tipo: curso?.CatTipoCurso?.Descripcion || null,
        estatus,
        calificacion,
        aprobado:
          estatus === 'completado' &&
          (calificacion === null || calificacion >= umbral),
      };
    });

    const aprobados = cursosDetalle.filter((c) => c.aprobado).length;
    const total = cursosDetalle.length;
    const porcentaje = total === 0 ? 0 : Math.round((aprobados / total) * 100);

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
      estatus: postulacion.estatus,
      porcentajeAvance: porcentaje,
      cursos: cursosDetalle,
    };
  }
}
