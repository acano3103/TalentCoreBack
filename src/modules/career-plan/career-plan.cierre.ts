export interface CierreMovimientoExterno {
  estatus: 'promovido';
  origen: 'movimiento externo';
}

/**
 * Si la persona ya ocupa el puesto objetivo y el plan no tiene movimiento,
 * el cierre propuesto es promovido por un cambio ocurrido fuera del plan.
 * No persiste nada: quien llame decide si aplica el resultado.
 */
export function cierrePorMovimientoExterno(entrada: {
  estatus: string;
  idPuestoActual: number | null;
  idPuestoObjetivo: number;
  hayMovimiento: boolean;
}): CierreMovimientoExterno | null {
  if (entrada.hayMovimiento) return null;
  if (entrada.idPuestoActual == null) return null;
  if (entrada.idPuestoActual !== entrada.idPuestoObjetivo) return null;
  if (entrada.estatus === 'promovido' || entrada.estatus === 'cancelado') {
    return null;
  }
  return { estatus: 'promovido', origen: 'movimiento externo' };
}
