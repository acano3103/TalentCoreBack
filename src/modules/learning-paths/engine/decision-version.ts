export type EstatusAsignacionPrevia =
  'por_aprobar' | 'activa' | 'completada' | 'sustituida' | 'cancelada';

export interface PreviaVersion {
  idAsignacion: number;
  idVersion: number;
  numero: number;
  estatus: EstatusAsignacionPrevia;
  conAvance: boolean;
}

export type DecisionVersion =
  'omitir' | 'sustituir' | 'solo_agregados' | 'completa';

export type ModalidadCurso =
  'presencial' | 'online_sincrono' | 'online_asincrono';

export interface Acreditacion {
  idParticipante: number;
  calificacion: number | null;
  vence: string | null;
}

const CON_AVANCE = new Set(['inscrito', 'completado', 'reconocido']);

export function tieneAvance(estados: string[]): boolean {
  return estados.some((estado) => CON_AVANCE.has(estado));
}

/**
 * D6. Una versión anterior activa y con avance no se toca.
 * Completada: solo lo agregado. Activa sin avance: se sustituye.
 * La misma versión ya asignada no se duplica.
 */
export function decidirVersion(
  previa: PreviaVersion | null,
  idVersion: number,
): DecisionVersion {
  if (
    !previa ||
    previa.estatus === 'cancelada' ||
    previa.estatus === 'sustituida'
  ) {
    return 'completa';
  }
  if (previa.idVersion === idVersion) return 'omitir';
  if (previa.estatus === 'completada') return 'solo_agregados';
  if (previa.estatus === 'activa' || previa.estatus === 'por_aprobar') {
    return previa.conAvance ? 'omitir' : 'sustituir';
  }
  return 'completa';
}

/** La previa relevante es la de mayor número, distinta o igual a la versión nueva. */
export function previaDe(
  previas: PreviaVersion[],
  idVersion: number,
  numeroNuevo: number,
): PreviaVersion | null {
  const vivas = previas.filter(
    (previa) =>
      previa.estatus !== 'cancelada' && previa.estatus !== 'sustituida',
  );
  const misma = vivas.find((previa) => previa.idVersion === idVersion);
  if (misma) return misma;
  return (
    vivas
      .filter((previa) => previa.numero < numeroNuevo)
      .sort((a, b) => b.numero - a.numero)[0] ?? null
  );
}

export function estadoDeElemento(entrada: {
  acreditacion: Acreditacion | null;
  hoy: string;
  umbral: number;
  modalidad: ModalidadCurso | null;
  tieneContenido: boolean;
}): {
  estado: 'reconocido' | 'inscrito' | 'por_programar';
  motivo: 'SIN_CONTENIDO' | null;
  reconocidoDe: number | null;
} {
  const acredita = entrada.acreditacion;
  if (
    acredita &&
    aprobada(acredita.calificacion, entrada.umbral) &&
    (acredita.vence == null || acredita.vence >= entrada.hoy)
  ) {
    return {
      estado: 'reconocido',
      motivo: null,
      reconocidoDe: acredita.idParticipante,
    };
  }
  if (
    entrada.modalidad === 'presencial' ||
    entrada.modalidad === 'online_sincrono'
  ) {
    return { estado: 'por_programar', motivo: null, reconocidoDe: null };
  }
  if (!entrada.tieneContenido) {
    return {
      estado: 'por_programar',
      motivo: 'SIN_CONTENIDO',
      reconocidoDe: null,
    };
  }
  return { estado: 'inscrito', motivo: null, reconocidoDe: null };
}

function aprobada(calificacion: number | null, umbral: number): boolean {
  if (calificacion == null) return true;
  return calificacion >= umbral;
}
