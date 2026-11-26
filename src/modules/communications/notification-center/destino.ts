/**
 * Destino lógico para web y app. DeepLink se conserva con la ruta anterior.
 * El push lo repite en `data.destino` como JSON `{ tipo, id? }`.
 *
 * Contrato de la app y del push (`data.destino` = JSON `{ tipo, id? }`):
 * `MI_CURSO` abre el curso (`id` = idSesion).
 * `MIS_CLASES` abre la clase (`id` = idFechaClase).
 * `MI_RUTA` abre la ruta de aprendizaje.
 * `MI_PLAN_CARRERA` abre el plan de carrera.
 */

export const TIPOS_DESTINO = [
  'CHECADOR',
  'MIS_ASISTENCIAS',
  'MI_EXPEDIENTE',
  'MI_CURSO',
  'MIS_CLASES',
  'MI_RUTA',
  'MI_PLAN_CARRERA',
  'APROBACIONES',
  'MI_SOLICITUD',
  'MI_COMUNICADO',
  'COMUNICADO_ADMIN',
  'CONSUMO_WA',
] as const;

export type TipoDestino = (typeof TIPOS_DESTINO)[number];

export interface DestinoNotificacion {
  tipo: TipoDestino;
  id?: number;
  params?: Record<string, string | number>;
}

export function leerDestino(valor: unknown): DestinoNotificacion | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const fila = valor as { tipo?: unknown; id?: unknown; params?: unknown };
  if (
    typeof fila.tipo !== 'string' ||
    !(TIPOS_DESTINO as readonly string[]).includes(fila.tipo)
  )
    return null;
  const destino: DestinoNotificacion = { tipo: fila.tipo as TipoDestino };
  if (typeof fila.id === 'number' && Number.isInteger(fila.id) && fila.id > 0)
    destino.id = fila.id;
  if (typeof fila.id === 'string' && /^[1-9]\d*$/.test(fila.id))
    destino.id = Number(fila.id);
  if (
    fila.params &&
    typeof fila.params === 'object' &&
    !Array.isArray(fila.params)
  ) {
    const params: Record<string, string | number> = {};
    for (const [clave, item] of Object.entries(fila.params)) {
      if (typeof item === 'string' || typeof item === 'number')
        params[clave] = item;
    }
    if (Object.keys(params).length) destino.params = params;
  }
  return destino;
}

/** Expo solo acepta strings en data. */
export function destinoEnPush(
  destino: DestinoNotificacion | null | undefined,
): string | null {
  return destino ? JSON.stringify(destino) : null;
}
