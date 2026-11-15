import { Canal, CANALES, esCanal } from '../channels/canales';

export const CODIGOS_REGLA = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11'] as const;

export type CodigoRegla = (typeof CODIGOS_REGLA)[number];

export interface ReglaDefault {
    codigo: CodigoRegla;
    nombre: string;
    parametros: Record<string, unknown>;
    canales: Canal[];
    plantilla: string;
}

/** Valores iniciales de la pantalla de recordatorios. Se crean al abrir la configuración. */
export const REGLAS_DEFAULT: readonly ReglaDefault[] = [
    {
        codigo: 'R1',
        nombre: 'Antes de la entrada',
        parametros: { minutosAntes: 15 },
        canales: ['APP', 'WEB'],
        plantilla: '{nombre}, tu entrada es a las {hora_entrada}.',
    },
    {
        codigo: 'R2',
        nombre: 'Sin registro de entrada',
        parametros: { minutosDespues: 10 },
        canales: ['APP', 'WEB'],
        plantilla: '{nombre}, no vemos tu entrada de las {hora_entrada}.',
    },
    {
        codigo: 'R3',
        nombre: 'Sin registro de salida',
        parametros: { minutosDespues: 30 },
        canales: ['APP', 'WEB'],
        plantilla: '{nombre}, recuerda registrar tu salida.',
    },
    {
        codigo: 'R4',
        nombre: 'Documento faltante',
        parametros: { cadaDias: 3, maxIntentos: 5 },
        canales: ['APP', 'WEB', 'CORREO'],
        plantilla: '{nombre}, falta cargar {documento}.',
    },
    {
        codigo: 'R5',
        nombre: 'Documento por vencer',
        parametros: { diasAntes: [30, 7, 1] },
        canales: ['APP', 'WEB', 'CORREO'],
        plantilla: '{nombre}, {documento} vence el {fecha_limite}.',
    },
    {
        codigo: 'R6',
        nombre: 'Documento rechazado',
        parametros: { cadaDias: 2, maxIntentos: 5 },
        canales: ['APP', 'WEB', 'CORREO'],
        plantilla: '{nombre}, rechazamos {documento}. Vuelve a cargarlo.',
    },
    {
        codigo: 'R7',
        nombre: 'Curso asignado',
        parametros: { cadaDias: 1, maxIntentos: 3 },
        canales: ['APP', 'WEB'],
        plantilla: '{nombre}, te asignamos el curso {curso}.',
    },
    {
        codigo: 'R8',
        nombre: 'Curso por vencer o atrasado',
        parametros: { diasAntes: 3, cadaDias: 1, maxIntentos: 5 },
        canales: ['APP', 'WEB'],
        plantilla: '{nombre}, el curso {curso} tiene fecha límite {fecha_limite}.',
    },
    {
        codigo: 'R9',
        nombre: 'Aprobación pendiente',
        parametros: { cadaDias: 1, maxIntentos: 5 },
        canales: ['APP', 'WEB', 'CORREO'],
        plantilla: '{nombre}, tienes pendiente la solicitud {solicitud}.',
    },
    {
        codigo: 'R10',
        nombre: 'Cambio de estatus',
        parametros: {},
        canales: ['APP', 'WEB', 'CORREO'],
        plantilla: '{nombre}, tu solicitud {solicitud} cambió de estatus.',
    },
    {
        codigo: 'R11',
        nombre: 'Comunicado pendiente',
        parametros: {},
        canales: ['APP', 'WEB'],
        plantilla: '{nombre}, tienes un comunicado pendiente: {solicitud}.',
    },
];

const POR_CODIGO = new Map(REGLAS_DEFAULT.map((regla) => [regla.codigo, regla]));

export function esCodigoRegla(valor: string): valor is CodigoRegla {
    return (CODIGOS_REGLA as readonly string[]).includes(valor);
}

export function reglaDefault(codigo: string): ReglaDefault | null {
    return POR_CODIGO.get(codigo as CodigoRegla) ?? null;
}

export function ordenRegla(codigo: string): number {
    const indice = CODIGOS_REGLA.indexOf(codigo as CodigoRegla);
    return indice === -1 ? CODIGOS_REGLA.length : indice;
}

export function validarParametros(codigo: string, valor: unknown): { ok: true; parametros: Record<string, unknown> } | { ok: false; message: string } {
    if (!esCodigoRegla(codigo)) return { ok: false, message: 'Esa regla de recordatorio no existe.' };
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
        return { ok: false, message: 'Los parámetros deben ser un objeto.' };
    }
    const crudo = valor as Record<string, unknown>;
    const claves = Object.keys(crudo);
    if (codigo === 'R10' || codigo === 'R11') {
        if (claves.length) return { ok: false, message: 'Esta regla no lleva parámetros.' };
        return { ok: true, parametros: {} };
    }
    if (codigo === 'R1') return soloEntero(crudo, claves, 'minutosAntes', 1, 180);
    if (codigo === 'R2' || codigo === 'R3') return soloEntero(crudo, claves, 'minutosDespues', 1, 240);
    if (codigo === 'R5') return soloDiasAntes(crudo, claves);
    if (codigo === 'R8') return ventanaCurso(crudo, claves);
    if (codigo === 'R4' || codigo === 'R6' || codigo === 'R7' || codigo === 'R9') return cadaDias(crudo, claves);
    return { ok: false, message: 'Esa regla de recordatorio no existe.' };
}

export function validarCanales(valor: unknown): Canal[] | null {
    if (!Array.isArray(valor) || !valor.length) return null;
    if (!valor.every((item) => typeof item === 'string' && esCanal(item))) return null;
    return CANALES.filter((canal) => (valor as string[]).includes(canal));
}

export function validarIds(valor: unknown): number[] | null {
    if (valor == null) return [];
    if (!Array.isArray(valor) || !valor.every((item) => Number.isInteger(item) && (item as number) > 0)) return null;
    return [...new Set(valor as number[])];
}

function soloEntero(
    crudo: Record<string, unknown>,
    claves: string[],
    campo: string,
    min: number,
    max: number,
): { ok: true; parametros: Record<string, unknown> } | { ok: false; message: string } {
    if (claves.length !== 1 || claves[0] !== campo) {
        return { ok: false, message: `Indica solo ${campo}.` };
    }
    const numero = entero(crudo[campo], min, max);
    if (numero == null) return { ok: false, message: `${campo} debe ser un entero entre ${min} y ${max}.` };
    return { ok: true, parametros: { [campo]: numero } };
}

function cadaDias(
    crudo: Record<string, unknown>,
    claves: string[],
): { ok: true; parametros: Record<string, unknown> } | { ok: false; message: string } {
    if (!mismasClaves(claves, ['cadaDias', 'maxIntentos'])) {
        return { ok: false, message: 'Indica cadaDias y maxIntentos.' };
    }
    const cada = entero(crudo.cadaDias, 1, 30);
    const max = entero(crudo.maxIntentos, 1, 10);
    if (cada == null || max == null) {
        return { ok: false, message: 'cadaDias va de 1 a 30 y maxIntentos de 1 a 10.' };
    }
    return { ok: true, parametros: { cadaDias: cada, maxIntentos: max } };
}

function soloDiasAntes(
    crudo: Record<string, unknown>,
    claves: string[],
): { ok: true; parametros: Record<string, unknown> } | { ok: false; message: string } {
    if (claves.length !== 1 || claves[0] !== 'diasAntes') {
        return { ok: false, message: 'Indica solo diasAntes.' };
    }
    const dias = listaDias(crudo.diasAntes, 1, 365);
    if (!dias) return { ok: false, message: 'diasAntes debe tener de 1 a 6 enteros entre 1 y 365.' };
    return { ok: true, parametros: { diasAntes: dias } };
}

function ventanaCurso(
    crudo: Record<string, unknown>,
    claves: string[],
): { ok: true; parametros: Record<string, unknown> } | { ok: false; message: string } {
    if (!mismasClaves(claves, ['diasAntes', 'cadaDias', 'maxIntentos'])) {
        return { ok: false, message: 'Indica diasAntes, cadaDias y maxIntentos.' };
    }
    const dias = entero(crudo.diasAntes, 1, 90);
    const cada = entero(crudo.cadaDias, 1, 30);
    const max = entero(crudo.maxIntentos, 1, 10);
    if (dias == null || cada == null || max == null) {
        return { ok: false, message: 'Revisa diasAntes (1 a 90), cadaDias (1 a 30) y maxIntentos (1 a 10).' };
    }
    return { ok: true, parametros: { diasAntes: dias, cadaDias: cada, maxIntentos: max } };
}

function listaDias(valor: unknown, min: number, max: number): number[] | null {
    if (!Array.isArray(valor) || valor.length < 1 || valor.length > 6) return null;
    const dias = valor.map((item) => entero(item, min, max));
    if (dias.some((item) => item == null)) return null;
    return [...new Set(dias as number[])].sort((a, b) => b - a);
}

function mismasClaves(claves: string[], esperadas: string[]): boolean {
    if (claves.length !== esperadas.length) return false;
    return esperadas.every((clave) => claves.includes(clave));
}

function entero(valor: unknown, min: number, max: number): number | null {
    if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < min || valor > max) return null;
    return valor;
}
