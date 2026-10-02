export type TipoChecada = 'ENTRADA' | 'SALIDA' | 'INICIO_COMIDA' | 'FIN_COMIDA';

/**
 * El biométrico y el IVR en producción mandan solo dos marcajes al día.
 * Aplicarles la máquina de cuatro estados interpretaría la salida como
 * INICIO_COMIDA y la jornada nunca cerraría. El modo es un parámetro.
 */
export type ModoInferencia =
  'EXPLICITO' | 'ALTERNANTE_SIMPLE' | 'SECUENCIA_COMPLETA';

export interface AccionSiguiente {
  sugerido: TipoChecada | null;
  permitidos: TipoChecada[];
}

export const TRANSICIONES_COMPLETA: Record<string, TipoChecada[]> = {
  NINGUNO: ['ENTRADA'],
  ENTRADA: ['INICIO_COMIDA', 'SALIDA'],
  INICIO_COMIDA: ['FIN_COMIDA'],
  FIN_COMIDA: ['SALIDA'],
  SALIDA: [],
};

export const TRANSICIONES_SIMPLE: Record<string, TipoChecada[]> = {
  NINGUNO: ['ENTRADA'],
  ENTRADA: ['SALIDA'],
  SALIDA: [],
};

export function siguienteAccion(
  ultimoTipo: TipoChecada | null,
  modo: ModoInferencia,
  obligatorioChecarComida: boolean,
): AccionSiguiente {
  const estado = ultimoTipo ?? 'NINGUNO';
  const tabla =
    modo === 'ALTERNANTE_SIMPLE' ? TRANSICIONES_SIMPLE : TRANSICIONES_COMPLETA;
  const permitidos = [...(tabla[estado] ?? [])];

  if (permitidos.length === 0) {
    return { sugerido: null, permitidos: [] };
  }

  let sugerido = permitidos[0];
  if (
    modo === 'SECUENCIA_COMPLETA' &&
    ultimoTipo === 'ENTRADA' &&
    !obligatorioChecarComida
  ) {
    sugerido = 'SALIDA';
  }

  return { sugerido, permitidos };
}
