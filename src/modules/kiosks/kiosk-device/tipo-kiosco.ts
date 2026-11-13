import { TipoChecada } from 'src/modules/attendance/engine/state-machine';

export type BotonKiosco = 'ENTRADA' | 'SALIDA';

const MENSAJE_SALIDA_COMIDA =
    'Tienes abierta tu salida a comida. Primero marca Entrada para registrar tu regreso y después marca Salida.';
const MENSAJE_SIN_ENTRADA = 'Todavía no tienes entrada hoy. Marca Entrada primero.';
const MENSAJE_YA_ENTRADA = 'Ya registraste tu entrada de hoy. Si te vas, marca Salida.';
const MENSAJE_YA_REGRESO = 'Ya registraste tu regreso de comida. Si te vas, marca Salida.';

/**
 * Paso real de la jornada que se registra cuando el empleado toca un botón del kiosco.
 * La única traducción es Entrada con la comida abierta o recién cerrada: FIN_COMIDA.
 * El resto se manda tal cual para que el motor aplique antirebote, jornada cerrada y las demás reglas.
 */
export function tipoRealKiosco(boton: BotonKiosco, ultimo: TipoChecada | null): TipoChecada {
    if (boton === 'ENTRADA' && (ultimo === 'INICIO_COMIDA' || ultimo === 'FIN_COMIDA')) {
        return 'FIN_COMIDA';
    }
    return boton;
}

/** Botón que el kiosco debe preseleccionar. null = la jornada ya cerró. */
export function botonSugeridoKiosco(ultimo: TipoChecada | null): BotonKiosco | null {
    if (ultimo === 'SALIDA') return null;
    if (ultimo === 'ENTRADA' || ultimo === 'FIN_COMIDA') return 'SALIDA';
    return 'ENTRADA';
}

/** Mensaje para la persona cuando el motor rechaza, según el botón y el último paso. */
export function mensajeRechazoKiosco(
    boton: BotonKiosco,
    ultimo: TipoChecada | null,
    codigoMotor: string,
    motivoMotor: string | null,
): string {
    if (codigoMotor === 'TRANSICION_INVALIDA') {
        if (boton === 'SALIDA' && ultimo === 'INICIO_COMIDA') return MENSAJE_SALIDA_COMIDA;
        if (boton === 'SALIDA' && ultimo == null) return MENSAJE_SIN_ENTRADA;
        if (boton === 'ENTRADA' && ultimo === 'ENTRADA') return MENSAJE_YA_ENTRADA;
        if (boton === 'ENTRADA' && ultimo === 'FIN_COMIDA') return MENSAJE_YA_REGRESO;
    }
    return motivoMotor?.trim() ?? '';
}
