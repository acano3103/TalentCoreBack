import { sumarDias, sumarMeses } from '../learning-paths/engine/impacto';

export { tipoDeNiveles } from './career-plan.niveles';

export function mesesEnPuesto(desde: string | null, hoy: string): number {
  if (!desde) return 0;
  const [anioDesde, mesDesde, diaDesde] = desde.split('-').map(Number);
  const [anioHoy, mesHoy, diaHoy] = hoy.split('-').map(Number);
  let meses = (anioHoy - anioDesde) * 12 + (mesHoy - mesDesde);
  if (diaHoy < diaDesde) meses -= 1;
  return Math.max(0, meses);
}

/** El movimiento aplicado al puesto actual gana sobre la fecha de ingreso. */
export function elegirInicio(
  movimientos: { fecha: string }[],
  ingreso: string | null,
): string | null {
  if (movimientos.length === 0) return ingreso;
  return [...movimientos].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0].fecha;
}

export interface FilaPlaza {
  idSite: number;
  nombre: string | null;
  autorizadas: number;
  ocupadas: number;
  libres: number;
}

export interface PlazasPuesto {
  total: number;
  porSite: FilaPlaza[];
  enSite: (idSite: number | null) => number;
}

export function desglosePlazas(
  autorizadas: { idSite: number; autorizadas: number }[],
  ocupadas: { idSite: number; ocupadas: number }[],
  nombres: Map<number, string | null>,
): PlazasPuesto {
  const sites = new Set<number>();
  const cupo = new Map<number, number>();
  const gente = new Map<number, number>();
  for (const fila of autorizadas) {
    sites.add(fila.idSite);
    cupo.set(fila.idSite, (cupo.get(fila.idSite) ?? 0) + fila.autorizadas);
  }
  for (const fila of ocupadas) {
    sites.add(fila.idSite);
    gente.set(fila.idSite, (gente.get(fila.idSite) ?? 0) + fila.ocupadas);
  }
  const porSite = [...sites]
    .sort((a, b) => a - b)
    .map((idSite) => {
      const autorizadasSite = cupo.get(idSite) ?? 0;
      const ocupadasSite = gente.get(idSite) ?? 0;
      return {
        idSite,
        nombre: nombres.get(idSite) ?? null,
        autorizadas: autorizadasSite,
        ocupadas: ocupadasSite,
        libres: Math.max(0, autorizadasSite - ocupadasSite),
      };
    });
  const total = porSite.reduce((suma, fila) => suma + fila.libres, 0);
  return {
    total,
    porSite,
    enSite: (idSite) => {
      if (idSite == null) return 0;
      return porSite.find((fila) => fila.idSite === idSite)?.libres ?? 0;
    },
  };
}

export type NivelPreparacion =
  'listo_ahora' | 'listo_sin_plaza' | 'uno_a_dos_anios' | 'en_desarrollo';

export function nivelPreparacion(input: {
  cursosCumplidos: number;
  cursos: number;
  antiguedadCumplida: boolean;
  mesesFaltantes: number;
  plazasEnSite: number;
}): NivelPreparacion {
  const cursosListos =
    input.cursos === 0 || input.cursosCumplidos === input.cursos;
  if (cursosListos && input.antiguedadCumplida && input.plazasEnSite > 0) {
    return 'listo_ahora';
  }
  if (cursosListos && input.antiguedadCumplida) return 'listo_sin_plaza';
  const ratio = input.cursos === 0 ? 1 : input.cursosCumplidos / input.cursos;
  if (ratio >= 0.6 && input.mesesFaltantes <= 12) return 'uno_a_dos_anios';
  return 'en_desarrollo';
}

export function porcentajeRequisitos(cumplidos: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((cumplidos / total) * 100);
}

export interface MarcaVigencia {
  vigente: boolean;
  caducada: boolean;
  vence: string | null;
}

const ABIERTOS = new Set(['inscrito', 'por_programar']);

/**
 * Vigente si está acreditado y no venció.
 * Caducada si la acreditación ya pasó su vigencia o el motor la marcó vencida.
 */
export function vigenciaDe(input: {
  vigenciaMeses: number | null;
  hoy: string;
  filas: { estado: string; vence: string | null }[];
  fechaConclusion: string | null;
}): MarcaVigencia {
  const acreditada = input.filas.find(
    (fila) => fila.estado === 'completado' || fila.estado === 'reconocido',
  );
  const marcada = input.filas.find((fila) => fila.estado === 'vencido');
  const reabierto = input.filas.some((fila) => ABIERTOS.has(fila.estado));
  if (reabierto) {
    if (marcada) {
      return { vigente: false, caducada: true, vence: marcada.vence };
    }
    if (acreditada?.vence != null && acreditada.vence < input.hoy) {
      return { vigente: false, caducada: true, vence: acreditada.vence };
    }
    return {
      vigente: false,
      caducada: false,
      vence: acreditada?.vence ?? null,
    };
  }
  if (acreditada) {
    const vence = acreditada.vence;
    const vigente = vence == null || vence >= input.hoy;
    return { vigente, caducada: !vigente, vence };
  }
  if (marcada) {
    return { vigente: false, caducada: true, vence: marcada.vence };
  }
  if (input.filas.length > 0) {
    return { vigente: false, caducada: false, vence: null };
  }
  if (input.vigenciaMeses == null || !input.fechaConclusion) {
    return { vigente: true, caducada: false, vence: null };
  }
  const vence = sumarMeses(input.fechaConclusion, input.vigenciaMeses);
  const vigente = vence >= input.hoy;
  return { vigente, caducada: !vigente, vence };
}

export interface TransicionPlan {
  estatus: string;
  cambio: boolean;
  accion: string | null;
  fechaListo: boolean;
  fechaRiesgo: boolean;
  /** undefined: no tocar. null: limpiar. string: fijar el límite. */
  fechaLimiteRenovacion?: string | null;
}

export function decidirTransicion(input: {
  estatus: string;
  prepCompleta: boolean;
  cursoVencido: boolean;
  hoy: string;
  fechaLimiteRenovacion: string | null;
  diasRenovacion: number;
}): TransicionPlan {
  const quieto = (estatus: string): TransicionPlan => ({
    estatus,
    cambio: false,
    accion: null,
    fechaListo: false,
    fechaRiesgo: false,
  });
  if (
    input.estatus === 'nominado' ||
    input.estatus === 'promovido' ||
    input.estatus === 'cancelado'
  ) {
    return quieto(input.estatus);
  }

  if (input.estatus === 'en_riesgo') {
    const tarde =
      input.fechaLimiteRenovacion != null &&
      input.hoy > input.fechaLimiteRenovacion;
    if (!tarde && !input.cursoVencido) {
      return {
        estatus: 'listo_para_ascenso',
        cambio: true,
        accion: 'RENOVADO',
        fechaListo: true,
        fechaRiesgo: false,
        fechaLimiteRenovacion: null,
      };
    }
    if (tarde && !input.cursoVencido && input.prepCompleta) {
      return {
        estatus: 'listo_para_ascenso',
        cambio: true,
        accion: 'LISTO',
        fechaListo: true,
        fechaRiesgo: false,
        fechaLimiteRenovacion: null,
      };
    }
    if (tarde) {
      return {
        estatus: 'en_preparacion',
        cambio: true,
        accion: 'REGRESO_PREPARACION',
        fechaListo: false,
        fechaRiesgo: false,
        fechaLimiteRenovacion: null,
      };
    }
    return quieto('en_riesgo');
  }

  if (input.estatus === 'en_preparacion' && input.prepCompleta) {
    return {
      estatus: 'listo_para_ascenso',
      cambio: true,
      accion: 'LISTO',
      fechaListo: true,
      fechaRiesgo: false,
    };
  }

  if (input.estatus === 'listo_para_ascenso' && input.cursoVencido) {
    return {
      estatus: 'en_riesgo',
      cambio: true,
      accion: 'EN_RIESGO',
      fechaListo: false,
      fechaRiesgo: true,
      fechaLimiteRenovacion: sumarDias(
        input.hoy,
        Math.max(0, input.diasRenovacion),
      ),
    };
  }

  return quieto(input.estatus);
}
