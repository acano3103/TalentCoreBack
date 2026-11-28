import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { HechoCurso } from 'src/common/events/comms-hechos';
import { AssignmentEngineService } from './assignment-engine.service';
import { AvisoMotor } from './ruta-avisos';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigurationService } from 'src/modules/configuration/configuration.service';
import { RutasModoAsignacion } from 'src/modules/configuration/training-config';
import {
  CursoVersion,
  DiffVersion,
  MarcaCurso,
  clasificarPersonas,
  diaAlmacenado,
  diffCursos,
  hoyNegocio,
  sumarMeses,
} from './impacto';
import { localDateString } from 'src/modules/attendance/utils/timezone.util';
import {
  EmpleadoAlcance,
  ReglaAlcance,
  coincide,
} from '../scope/resolver.service';

const ZONA = 'America/Mexico_City';

export interface EntradaVersion {
  idEmpresa: number;
  idRuta: number;
  idVersion: number;
}

export interface ResultadoSimulacion {
  alcanzados: number;
  yaTienenVigentes: number;
  recibiranSoloNuevos: number;
  recibiranCompleta: number;
  presencialesAProgramar: number;
  diff: DiffVersion;
}

export interface ResultadoPublicacion {
  grupos: {
    vanALaMitad: number;
    yaCompletaron: number;
    aunNoInician: number;
  };
  modo: RutasModoAsignacion;
  idLote: number | null;
  hechos?: HechoCurso[];
  avisos?: AvisoMotor[];
}

export interface EntradaPublicacion extends EntradaVersion {
  idTenant: number | null;
  publicadoPor: string;
  nombreRuta: string;
  disparador: 'publicacion';
}

type Cliente = Prisma.TransactionClient;

@Injectable()
export class RutaMotorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfigurationService,
    @Optional() private readonly asignacion?: AssignmentEngineService,
  ) {}

  /** Lee el alcance y el diff. No crea ni actualiza filas. */
  async simular(entrada: EntradaVersion): Promise<ResultadoSimulacion> {
    const impacto = await this.calcular(this.prisma, entrada);
    return {
      alcanzados: impacto.clasificacion.alcanzados,
      yaTienenVigentes: impacto.clasificacion.yaTienenVigentes,
      recibiranSoloNuevos: impacto.clasificacion.recibiranSoloNuevos,
      recibiranCompleta: impacto.clasificacion.recibiranCompleta,
      presencialesAProgramar: impacto.clasificacion.presencialesAProgramar,
      diff: impacto.diff,
    };
  }

  /**
   * Disparador `publicacion`. Clasifica a las personas alcanzadas.
   * Con aprobación abre un lote; la asignación por persona queda para el motor completo.
   */
  async ejecutar(
    db: Cliente,
    entrada: EntradaPublicacion,
  ): Promise<ResultadoPublicacion> {
    if (this.asignacion) {
      const trabajo = await this.asignacion.asignarEn(db, {
        idEmpresa: entrada.idEmpresa,
        idTenant: entrada.idTenant,
        idVersion: entrada.idVersion,
        disparador: 'publicacion',
        creadoPor: entrada.publicadoPor,
      });
      return {
        grupos: trabajo.resumen.grupos,
        modo: trabajo.resumen.modo,
        idLote: trabajo.resumen.idLote,
        hechos: trabajo.hechos,
        avisos: trabajo.avisos,
      };
    }
    const impacto = await this.calcular(db, entrada);
    const config = await this.configuracion.getTrainingConfig(
      entrada.idEmpresa,
    );
    const modo = config.rutasModoAsignacion;
    if (modo !== 'con_aprobacion') {
      return { grupos: impacto.clasificacion.grupos, modo, idLote: null };
    }

    const lote = await db.rutaLote.create({
      data: {
        idTenant: entrada.idTenant,
        idEmpresa: entrada.idEmpresa,
        idRutaAprendizaje: entrada.idRuta,
        idVersion: entrada.idVersion,
        disparador: 'publicacion',
        descripcion: `Publicación de ${entrada.nombreRuta}`.slice(0, 255),
        estatus: 'por_aprobar',
        personas: impacto.clasificacion.alcanzados,
        cursos: impacto.cursos.length,
        creadoPor: entrada.publicadoPor,
      },
    });
    return {
      grupos: impacto.clasificacion.grupos,
      modo,
      idLote: lote.idLote,
      avisos: [
        {
          tipo: 'por_aprobar',
          idEmpresa: entrada.idEmpresa,
          idTenant: entrada.idTenant,
        },
      ],
    };
  }

  private async calcular(db: Cliente, entrada: EntradaVersion) {
    const version = await db.rutaVersion.findFirst({
      where: {
        idVersion: entrada.idVersion,
        idRutaAprendizaje: entrada.idRuta,
        RutaAprendizaje: { idEmpresa: entrada.idEmpresa },
      },
      include: {
        RutaAlcances: true,
        RutaEtapas: { include: { RutaElementos: true } },
      },
    });
    if (!version) {
      return vacio();
    }

    const publicada =
      version.estado === 'publicada'
        ? version
        : await db.rutaVersion.findFirst({
            where: { idRutaAprendizaje: entrada.idRuta, estado: 'publicada' },
            include: { RutaEtapas: { include: { RutaElementos: true } } },
          });

    const cursos = await this.conNombre(db, aplanar(version));
    const base = publicada ? await this.conNombre(db, aplanar(publicada)) : [];
    const diff = diffCursos(
      version.estado === 'publicada' ? cursos : base,
      cursos,
    );
    const reglas: ReglaAlcance[] = version.RutaAlcances.map((regla) => ({
      modo: regla.modo,
      idUnidadOperativa: regla.idUnidadOperativa,
      estado: regla.estado,
      idSite: regla.idSite,
      idPuesto: regla.idPuesto,
      idArea: regla.idArea,
    }));

    const personas = await this.personasAlcanzadas(
      db,
      entrada.idEmpresa,
      reglas,
      cursos,
    );
    const presenciales = await this.presencialesSinSesion(
      db,
      entrada.idEmpresa,
      cursos,
    );
    return {
      cursos,
      diff,
      clasificacion: clasificarPersonas(cursos, personas, presenciales),
    };
  }

  private async conNombre(
    db: Cliente,
    cursos: CursoVersion[],
  ): Promise<CursoVersion[]> {
    if (cursos.length === 0) return cursos;
    const filas = await db.catCursos.findMany({
      where: { idCursos: { in: cursos.map((curso) => curso.idCurso) } },
      select: { idCursos: true, Descripcion: true },
    });
    const nombres = new Map(
      filas.map((fila) => [
        fila.idCursos,
        fila.Descripcion ?? `Curso ${fila.idCursos}`,
      ]),
    );
    return cursos.map((curso) => ({
      ...curso,
      nombre: nombres.get(curso.idCurso) ?? curso.nombre,
    }));
  }

  private async personasAlcanzadas(
    db: Cliente,
    idEmpresa: number,
    reglas: ReglaAlcance[],
    cursos: CursoVersion[],
  ) {
    const empleados = await db.empleados.findMany({
      where: { idEmpresa, activo: true },
      select: {
        idEmpleado: true,
        idPuesto: true,
        idSite: true,
        CatPuestos: { select: { idArea: true } },
      },
    });
    if (empleados.length === 0) return [];

    const ids = empleados.map((empleado) => empleado.idEmpleado);
    const principales = await db.relEmpleadosSites.findMany({
      where: {
        idEmpresa,
        EsPrincipal: true,
        Activo: true,
        idEmpleado: { in: ids },
      },
      orderBy: { FechaAsignacion: 'desc' },
      select: { idEmpleado: true, idSite: true },
    });
    const sitePrincipal = new Map<number, number>();
    for (const fila of principales) {
      if (!sitePrincipal.has(fila.idEmpleado))
        sitePrincipal.set(fila.idEmpleado, fila.idSite);
    }

    const idsSites = [
      ...new Set(
        empleados
          .map(
            (empleado) =>
              sitePrincipal.get(empleado.idEmpleado) ?? empleado.idSite,
          )
          .filter((id): id is number => id != null),
      ),
    ];
    const sites = idsSites.length
      ? await db.catSites.findMany({
          where: { idSite: { in: idsSites } },
          select: { idSite: true, idUnidadOperativa: true, Estado: true },
        })
      : [];
    const porSite = new Map(sites.map((site) => [site.idSite, site]));
    const progreso = await this.progreso(db, idEmpresa, ids, cursos);
    const hoy = hoyNegocio();

    const personas: { cursos: Map<number, MarcaCurso> }[] = [];
    for (const empleado of empleados) {
      const idSite =
        sitePrincipal.get(empleado.idEmpleado) ?? empleado.idSite ?? null;
      const site = idSite == null ? null : porSite.get(idSite);
      const contexto: EmpleadoAlcance = {
        idEmpresa,
        idPuesto: empleado.idPuesto,
        idArea: empleado.CatPuestos?.idArea ?? null,
        idSite,
        idUnidadOperativa: site?.idUnidadOperativa ?? null,
        estado: site?.Estado ?? null,
      };
      if (!coincide(contexto, reglas)) continue;
      personas.push({
        cursos: marcasDe(progreso.get(empleado.idEmpleado), cursos, hoy),
      });
    }
    return personas;
  }

  private async progreso(
    db: Cliente,
    idEmpresa: number,
    idsEmpleado: number[],
    cursos: CursoVersion[],
  ) {
    const porPersona = new Map<
      number,
      Map<number, { marca: MarcaCurso; vence: string | null }>
    >();
    if (cursos.length === 0) return porPersona;
    const idsCurso = cursos.map((curso) => curso.idCurso);
    const vigencia = new Map(
      cursos.map((curso) => [curso.idCurso, curso.vigenciaMeses]),
    );

    const asignados = await db.rutaAsignacionCurso.findMany({
      where: {
        idCurso: { in: idsCurso },
        RutaAsignacion: {
          idEmpresa,
          idEmpleado: { in: idsEmpleado },
          estatus: { in: ['activa', 'completada', 'por_aprobar'] },
        },
      },
      select: {
        idCurso: true,
        estado: true,
        venceVigencia: true,
        RutaAsignacion: { select: { idEmpleado: true } },
      },
    });
    for (const fila of asignados) {
      anotar(
        porPersona,
        fila.RutaAsignacion.idEmpleado,
        fila.idCurso,
        fila.estado === 'completado' || fila.estado === 'reconocido'
          ? 'vigente'
          : 'iniciado',
        fila.venceVigencia ? diaAlmacenado(fila.venceVigencia) : null,
      );
    }

    const participantes = await db.cursoParticipantes.findMany({
      where: {
        idEmpleado: { in: idsEmpleado },
        CursoSesiones: { idEmpresa, idCurso: { in: idsCurso } },
      },
      select: {
        idEmpleado: true,
        estatusAsignacion: true,
        creadoEn: true,
        CursoSesiones: { select: { idCurso: true } },
        CursoSeguimientoParticipante: { select: { fechaConclusion: true } },
      },
    });
    for (const fila of participantes) {
      const idCurso = fila.CursoSesiones.idCurso;
      if (fila.estatusAsignacion === 'completado') {
        const conclusion =
          fila.CursoSeguimientoParticipante?.fechaConclusion ?? fila.creadoEn;
        const meses = vigencia.get(idCurso);
        const vence =
          conclusion && meses != null
            ? sumarMeses(localDateString(conclusion, ZONA), meses)
            : null;
        anotar(
          porPersona,
          fila.idEmpleado,
          idCurso,
          'vigente',
          meses == null ? null : vence,
        );
      } else if (fila.estatusAsignacion === 'inscrito') {
        anotar(porPersona, fila.idEmpleado, idCurso, 'iniciado', null);
      }
    }
    return porPersona;
  }

  private async presencialesSinSesion(
    db: Cliente,
    idEmpresa: number,
    cursos: CursoVersion[],
  ): Promise<Set<number>> {
    if (cursos.length === 0) return new Set();
    const ids = cursos.map((curso) => curso.idCurso);
    const sesiones = await db.cursoSesiones.findMany({
      where: { idEmpresa, idCurso: { in: ids } },
      orderBy: { creadoEn: 'desc' },
      select: {
        idCurso: true,
        modalidad: true,
        estatus: true,
        esPermanente: true,
        fechaInicioPeriodo: true,
        fechaFinPeriodo: true,
      },
    });
    const modalidad = new Map<number, string>();
    const conCupo = new Set<number>();
    const ahora = new Date();
    for (const sesion of sesiones) {
      if (!modalidad.has(sesion.idCurso))
        modalidad.set(sesion.idCurso, sesion.modalidad);
      const abierta =
        sesion.esPermanente ||
        (sesion.fechaFinPeriodo != null
          ? sesion.fechaFinPeriodo >= ahora
          : sesion.fechaInicioPeriodo >= ahora);
      if (
        sesion.modalidad === 'presencial' &&
        (sesion.estatus === 'programado' || sesion.estatus === 'en_curso') &&
        abierta
      ) {
        conCupo.add(sesion.idCurso);
      }
    }
    return new Set(
      ids.filter(
        (id) => modalidad.get(id) === 'presencial' && !conCupo.has(id),
      ),
    );
  }
}

function aplanar(version: {
  RutaEtapas: {
    diaInicio: number;
    diaFin: number;
    RutaElementos: {
      idCurso: number;
      obligatorio: boolean;
      vigenciaMeses: number | null;
    }[];
  }[];
}): CursoVersion[] {
  return version.RutaEtapas.flatMap((etapa) =>
    etapa.RutaElementos.map((elemento) => ({
      idCurso: elemento.idCurso,
      nombre: `Curso ${elemento.idCurso}`,
      diaInicio: etapa.diaInicio,
      diaFin: etapa.diaFin,
      obligatorio: elemento.obligatorio,
      vigenciaMeses: elemento.vigenciaMeses,
    })),
  );
}

function anotar(
  porPersona: Map<
    number,
    Map<number, { marca: MarcaCurso; vence: string | null }>
  >,
  idEmpleado: number,
  idCurso: number,
  marca: MarcaCurso,
  vence: string | null,
) {
  const cursos =
    porPersona.get(idEmpleado) ??
    new Map<number, { marca: MarcaCurso; vence: string | null }>();
  const previo = cursos.get(idCurso);
  if (!previo || (marca === 'vigente' && previo.marca !== 'vigente')) {
    cursos.set(idCurso, { marca, vence });
  } else if (marca === 'vigente' && previo.marca === 'vigente') {
    if (previo.vence != null && (vence == null || vence > previo.vence)) {
      cursos.set(idCurso, { marca, vence });
    }
  }
  porPersona.set(idEmpleado, cursos);
}

function marcasDe(
  cursos: Map<number, { marca: MarcaCurso; vence: string | null }> | undefined,
  esperados: CursoVersion[],
  hoy: string,
): Map<number, MarcaCurso> {
  const marcas = new Map<number, MarcaCurso>();
  if (!cursos) return marcas;
  for (const curso of esperados) {
    const marca = cursos.get(curso.idCurso);
    if (!marca) continue;
    if (
      marca.marca === 'vigente' &&
      (marca.vence == null || marca.vence >= hoy)
    ) {
      marcas.set(curso.idCurso, 'vigente');
    } else {
      marcas.set(curso.idCurso, 'iniciado');
    }
  }
  return marcas;
}

function vacio() {
  return {
    cursos: [] as CursoVersion[],
    diff: { agregados: [], quitados: [], cambiados: [], sinCambio: [] },
    clasificacion: clasificarPersonas([], [], new Set()),
  };
}
