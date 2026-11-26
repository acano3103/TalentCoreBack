import { UMBRAL_APROBATORIO_DEFAULT } from '../../modules/career-plan/career-plan.constants';

/**
 * Lleva una calificación a la escala del umbral.
 * Hay calificaciones históricas en escala 0–10 y umbrales en escala 0–100.
 * Regla: si el umbral es > 10 y la calificación es <= 10, se multiplica por 10.
 */
export function normalizarCalificacion(calificacion: number, umbral: number): number {
  const limite = umbralEfectivo(umbral);
  const valor = limite > 10 && calificacion <= 10 ? calificacion * 10 : calificacion;
  return Math.round(valor * 100) / 100;
}

/**
 * true si la calificación alcanza el umbral.
 * Una calificación nula cuenta como aprobada (cursos sin evaluación).
 */
export function calificacionAprobada(
  calificacion: number | null | undefined,
  umbral: number,
): boolean {
  if (calificacion == null) return true;
  if (!Number.isFinite(calificacion)) return false;
  return normalizarCalificacion(calificacion, umbral) >= umbralEfectivo(umbral);
}

function umbralEfectivo(umbral: number): number {
  if (umbral == null || umbral === 0 || !Number.isFinite(umbral)) {
    return UMBRAL_APROBATORIO_DEFAULT;
  }
  return umbral;
}
