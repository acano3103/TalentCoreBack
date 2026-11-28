const POSTULACION =
  /^Colaborador \d+ postulado a la ruta \(puesto (\d+) -> (\d+)\) por (.+)$/;

export function idsPuestosDeHistorial(
  descripcion: string | null | undefined,
): number[] {
  const coincidencia = (descripcion ?? '').trim().match(POSTULACION);
  if (!coincidencia) return [];
  return [Number(coincidencia[1]), Number(coincidencia[2])];
}

export function textoPostulacion(
  actor: string,
  puestoOrigen: string,
  puestoDestino: string,
): string {
  return `Postulado por ${actor.trim()}: ${puestoOrigen.trim()} → ${puestoDestino.trim()}`;
}

/** Reescribe el texto viejo con ids. El resto se devuelve igual, sin tocar la tabla. */
export function describirHistorial(
  descripcion: string | null | undefined,
  puestos: ReadonlyMap<number, string>,
): string {
  const texto = (descripcion ?? '').trim();
  const coincidencia = texto.match(POSTULACION);
  if (!coincidencia) return descripcion ?? '';
  const origenId = Number(coincidencia[1]);
  const destinoId = Number(coincidencia[2]);
  const origen = puestos.get(origenId)?.trim() || `Puesto ${origenId}`;
  const destino = puestos.get(destinoId)?.trim() || `Puesto ${destinoId}`;
  return textoPostulacion(coincidencia[3], origen, destino);
}
