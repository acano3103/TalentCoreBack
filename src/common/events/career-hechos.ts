/**
 * El movimiento interno avisa al plan de carrera sin importar el módulo.
 * Un fallo del oyente no cambia la respuesta HTTP de quien emitió.
 */

export const CAREER_EVENTO_MOVIMIENTO = 'career.movimiento';

export type TipoHechoMovimientoCarrera = 'APLICADO' | 'RECHAZADO';

export interface HechoMovimientoCarrera {
  tipo: TipoHechoMovimientoCarrera;
  idEmpresa: number;
  idPlanCarrera: number;
  idMovimiento: number;
  idUsuario?: number | null;
  fechaEfectiva?: Date | string | null;
}

export interface EmisorAsync {
  emitAsync(evento: string, payload: unknown): Promise<unknown>;
}

export async function emitirHechoCarrera(
  emisor: EmisorAsync | null | undefined,
  payload: HechoMovimientoCarrera,
): Promise<void> {
  if (!emisor?.emitAsync) return;
  try {
    await emisor.emitAsync(CAREER_EVENTO_MOVIMIENTO, payload);
  } catch {
    // El movimiento ya quedó aplicado o rechazado.
  }
}
