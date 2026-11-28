import { calificacionAprobada } from '../../common/utils/calificacion';
import { UMBRAL_APROBATORIO_DEFAULT } from './career-plan.constants';

export type EstatusCursoPlan =
  'completado' | 'en_curso' | 'reprobado' | 'pendiente';

export interface SesionPlan {
  idSesion: number;
  idCurso: number;
  fechaInicioPeriodo?: Date | string | null;
}

export interface ParticipacionPlan {
  idEmpleado: number;
  idSesion: number;
  estatusAsignacion?: string | null;
  calificacionFinal?: number | string | { toString(): string } | null;
}

export interface CursoPlanEvaluado {
  idCurso: number;
  estatus: EstatusCursoPlan;
  calificacion: number | null;
  aprobado: boolean;
  idSesion: number | null;
}

export interface AvanceCursos {
  total: number;
  aprobados: number;
  porcentaje: number;
  cursos: CursoPlanEvaluado[];
}

const PRIORIDAD: Record<string, number> = {
  inscrito: 0,
  no_asistio: 0,
  reprobado: 1,
  completado: 2,
};

const empresasAvisadas = new Set<number>();

export function reiniciarAvisosUmbral(): void {
  empresasAvisadas.clear();
}

// Default 70. Un valor <= 10 se lee como escala 0-10 (8 → 80) y se avisa una vez por empresa.
export function resolverUmbralAprobatorio(
  valor: string | null | undefined,
  companyId: number,
  logger: { warn(message: string): void },
): number {
  if (valor == null || valor.trim() === '') return UMBRAL_APROBATORIO_DEFAULT;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return UMBRAL_APROBATORIO_DEFAULT;
  if (numero <= 10) {
    const interpretado = numero * 10;
    if (!empresasAvisadas.has(companyId)) {
      empresasAvisadas.add(companyId);
      logger.warn(
        `La empresa ${companyId} tiene calificacion_aprobatoria=${numero} en escala 0-10; se interpreta como ${interpretado}.`,
      );
    }
    return interpretado;
  }
  return numero;
}

// Misma regla para el listado web, el detalle y la app: un curso cuenta una vez,
// con la participación de mayor prioridad, y aprueba si está completado y la
// calificación es nula o alcanza el umbral.
export function evaluarCursos(
  idEmpleado: number,
  malla: number[],
  sesiones: SesionPlan[],
  participantes: ParticipacionPlan[],
  umbral: number,
): AvanceCursos {
  const sesionCurso = new Map(
    sesiones.map((sesion) => [sesion.idSesion, sesion.idCurso]),
  );
  const delEmpleado = participantes.filter(
    (part) => part.idEmpleado === idEmpleado,
  );
  const sesionesDelEmpleado = new Set(delEmpleado.map((part) => part.idSesion));

  const mejor = new Map<
    number,
    { part: ParticipacionPlan; prioridad: number }
  >();
  for (const part of delEmpleado) {
    const cursoId = sesionCurso.get(part.idSesion);
    if (cursoId === undefined || !malla.includes(cursoId)) continue;
    const prioridad = PRIORIDAD[part.estatusAsignacion ?? 'inscrito'] ?? 0;
    const actual = mejor.get(cursoId);
    if (!actual || prioridad > actual.prioridad) {
      mejor.set(cursoId, { part, prioridad });
    }
  }

  const cursos = malla.map((idCurso) => {
    const reg = mejor.get(idCurso);
    const estatus = estatusCurso(reg?.part);
    const calificacion =
      reg?.part.calificacionFinal != null
        ? Number(reg.part.calificacionFinal)
        : null;
    const aprobado =
      estatus === 'completado' && calificacionAprobada(calificacion, umbral);
    const delCurso = sesiones.filter(
      (sesion) =>
        sesion.idCurso === idCurso && sesionesDelEmpleado.has(sesion.idSesion),
    );
    return {
      idCurso,
      estatus,
      calificacion,
      aprobado,
      idSesion: sesionReciente(delCurso),
    };
  });

  const aprobados = cursos.filter((curso) => curso.aprobado).length;
  const total = cursos.length;
  return {
    total,
    aprobados,
    porcentaje: total === 0 ? 0 : Math.round((aprobados / total) * 100),
    cursos,
  };
}

function estatusCurso(part: ParticipacionPlan | undefined): EstatusCursoPlan {
  if (!part) return 'pendiente';
  if (part.estatusAsignacion === 'completado') return 'completado';
  if (part.estatusAsignacion === 'reprobado') return 'reprobado';
  return 'en_curso';
}

function sesionReciente(sesiones: SesionPlan[]): number | null {
  if (sesiones.length === 0) return null;
  const ordenadas = [...sesiones].sort((a, b) => {
    const diferencia = instante(b) - instante(a);
    if (diferencia !== 0) return diferencia;
    return b.idSesion - a.idSesion;
  });
  return ordenadas[0].idSesion;
}

function instante(sesion: SesionPlan): number {
  if (!sesion.fechaInicioPeriodo) return 0;
  const tiempo = new Date(sesion.fechaInicioPeriodo).getTime();
  return Number.isNaN(tiempo) ? 0 : tiempo;
}
