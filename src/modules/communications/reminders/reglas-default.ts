import { Canal, CANALES, esCanal } from '../channels/canales';

export const CODIGOS_REGLA = ['R1', 'R2', 'R3', 'R12', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11'] as const;

export type CodigoRegla = (typeof CODIGOS_REGLA)[number];

export const TIPOS_CAMPO = ['minutos', 'horas', 'dias', 'hora', 'entero'] as const;

export type TipoCampoRegla = (typeof TIPOS_CAMPO)[number];

export interface CampoRegla {
    clave: string;
    etiqueta: string;
    ayuda: string;
    tipo: TipoCampoRegla;
    min: number | null;
    max: number | null;
}

export interface VariableRegla {
    token: string;
    etiqueta: string;
}

export interface ReglaDefault {
    codigo: CodigoRegla;
    nombre: string;
    descripcion: string;
    destinatario: string;
    seCierraCuando: string;
    campos: CampoRegla[];
    variables: VariableRegla[];
    activo: boolean;
    parametros: Record<string, unknown>;
    canales: Canal[];
    plantilla: string;
}

function minutos(clave: string, etiqueta: string, ayuda: string, min: number, max: number): CampoRegla {
    return { clave, etiqueta, ayuda, tipo: 'minutos', min, max };
}

function campoDias(clave: string, etiqueta: string, ayuda: string, min: number, max: number): CampoRegla {
    return { clave, etiqueta, ayuda, tipo: 'dias', min, max };
}

function hora(clave: string, etiqueta: string, ayuda: string): CampoRegla {
    return { clave, etiqueta, ayuda, tipo: 'hora', min: null, max: null };
}

function enteroCampo(clave: string, etiqueta: string, ayuda: string, min: number, max: number): CampoRegla {
    return { clave, etiqueta, ayuda, tipo: 'entero', min, max };
}

const NOMBRE: VariableRegla = { token: '{nombre}', etiqueta: 'Nombre' };
const HORA_ENTRADA: VariableRegla = { token: '{hora_entrada}', etiqueta: 'Hora de entrada' };
const DOCUMENTO: VariableRegla = { token: '{documento}', etiqueta: 'Documento' };
const FECHA_LIMITE: VariableRegla = { token: '{fecha_limite}', etiqueta: 'Fecha límite' };
const CURSO: VariableRegla = { token: '{curso}', etiqueta: 'Curso' };
const SOLICITUD: VariableRegla = { token: '{solicitud}', etiqueta: 'Solicitud' };
const EQUIPO: VariableRegla = { token: '{equipo}', etiqueta: 'Equipo' };
const TITULO: VariableRegla = { token: '{solicitud}', etiqueta: 'Título' };

const CADA_DIAS = campoDias('cadaDias', 'Repetir cada', 'Días entre un aviso y el siguiente.', 1, 30);
const MAX_INTENTOS = enteroCampo('maxIntentos', 'Máximo de avisos', 'Cuántas veces se puede enviar este recordatorio.', 1, 10);

/** Valores iniciales de la pantalla de recordatorios. Se crean al abrir la configuración. */
export const REGLAS_DEFAULT: readonly ReglaDefault[] = [
    {
        codigo: 'R1',
        nombre: 'Falta checar entrada',
        descripcion: 'Avisa si no hay registro de entrada pasados los minutos indicados.',
        destinatario: 'El colaborador',
        seCierraCuando: 'Cuando registra la entrada o llega la hora de salida del turno.',
        campos: [minutos('minutosDespues', 'Minutos después de la entrada', 'Minutos después de la hora de entrada antes de avisar.', 1, 240)],
        variables: [NOMBRE, HORA_ENTRADA],
        activo: true,
        parametros: { minutosDespues: 10 },
        canales: ['APP', 'WEB'],
        plantilla: '{nombre}, no vemos tu entrada de las {hora_entrada}.',
    },
    {
        codigo: 'R2',
        nombre: 'Olvidó checar salida',
        descripcion: 'Avisa si hay entrada y no hay salida pasados los minutos indicados.',
        destinatario: 'El colaborador',
        seCierraCuando: 'Cuando registra la salida, o si ese turno no tuvo entrada.',
        campos: [minutos('minutosDespues', 'Minutos después de la salida', 'Minutos después de la hora de salida del turno.', 1, 240)],
        variables: [NOMBRE, HORA_ENTRADA],
        activo: true,
        parametros: { minutosDespues: 30 },
        canales: ['APP', 'WEB'],
        plantilla: '{nombre}, recuerda registrar tu salida.',
    },
    {
        codigo: 'R3',
        nombre: 'Resumen de ausencias del equipo',
        descripcion: 'Un aviso al jefe con las personas de su equipo que no registraron entrada.',
        destinatario: 'El jefe directo',
        seCierraCuando: 'Un solo aviso por día, después de la hora de corte, si hay ausencias.',
        campos: [hora('horaCorte', 'Hora de corte', 'Hora local en la que se envía el resumen.')],
        variables: [NOMBRE, EQUIPO],
        activo: false,
        parametros: { horaCorte: '10:00' },
        canales: ['APP', 'WEB'],
        plantilla: '{nombre}, estas personas de tu equipo no registraron entrada: {equipo}.',
    },
    {
        codigo: 'R12',
        nombre: 'Antes de la entrada',
        descripcion: 'Avisa antes de la hora de entrada si todavía no hay registro.',
        destinatario: 'El colaborador',
        seCierraCuando: 'Cuando registra la entrada o llega la hora de entrada.',
        campos: [minutos('minutosAntes', 'Minutos antes de la entrada', 'Minutos antes de la hora de entrada.', 1, 180)],
        variables: [NOMBRE, HORA_ENTRADA],
        activo: false,
        parametros: { minutosAntes: 15 },
        canales: ['APP', 'WEB'],
        plantilla: '{nombre}, tu entrada es a las {hora_entrada}.',
    },
    {
        codigo: 'R4',
        nombre: 'Documento faltante',
        descripcion: 'Recuerda cargar un documento que falta en el expediente.',
        destinatario: 'El colaborador',
        seCierraCuando: 'Cuando el documento deja de estar faltante.',
        campos: [CADA_DIAS, MAX_INTENTOS],
        variables: [NOMBRE, DOCUMENTO],
        activo: true,
        parametros: { cadaDias: 3, maxIntentos: 5 },
        canales: ['APP', 'WEB', 'CORREO'],
        plantilla: '{nombre}, falta cargar {documento}.',
    },
    {
        codigo: 'R5',
        nombre: 'Documento por vencer',
        descripcion: 'Avisa los días indicados antes de que venza un documento.',
        destinatario: 'El colaborador',
        seCierraCuando: 'Cuando el documento vence, se renueva o deja de tener fecha.',
        campos: [campoDias('diasAntes', 'Días de anticipación', 'Días antes del vencimiento. Una lista de 1 a 6 enteros.', 1, 365)],
        variables: [NOMBRE, DOCUMENTO, FECHA_LIMITE],
        activo: true,
        parametros: { diasAntes: [30, 7, 1] },
        canales: ['APP', 'WEB', 'CORREO'],
        plantilla: '{nombre}, {documento} vence el {fecha_limite}.',
    },
    {
        codigo: 'R6',
        nombre: 'Documento rechazado',
        descripcion: 'Recuerda volver a cargar un documento rechazado.',
        destinatario: 'El colaborador',
        seCierraCuando: 'Cuando el documento deja de estar rechazado.',
        campos: [CADA_DIAS, MAX_INTENTOS],
        variables: [NOMBRE, DOCUMENTO],
        activo: true,
        parametros: { cadaDias: 2, maxIntentos: 5 },
        canales: ['APP', 'WEB', 'CORREO'],
        plantilla: '{nombre}, rechazamos {documento}. Vuelve a cargarlo.',
    },
    {
        codigo: 'R7',
        nombre: 'Curso asignado',
        descripcion: 'Recuerda un curso asignado que sigue abierto.',
        destinatario: 'La persona inscrita',
        seCierraCuando: 'Cuando el curso deja de estar abierto.',
        campos: [CADA_DIAS, MAX_INTENTOS],
        variables: [NOMBRE, CURSO],
        activo: true,
        parametros: { cadaDias: 1, maxIntentos: 3 },
        canales: ['APP', 'WEB'],
        plantilla: '{nombre}, te asignamos el curso {curso}.',
    },
    {
        codigo: 'R8',
        nombre: 'Curso por vencer o atrasado',
        descripcion: 'Avisa cuando un curso está por vencer o ya se atrasó.',
        destinatario: 'La persona inscrita',
        seCierraCuando: 'Cuando el curso deja de estar abierto o no tiene fecha límite.',
        campos: [
            campoDias('diasAntes', 'Días de anticipación', 'Días antes de la fecha límite en los que empieza el aviso.', 1, 90),
            CADA_DIAS,
            MAX_INTENTOS,
        ],
        variables: [NOMBRE, CURSO, FECHA_LIMITE],
        activo: true,
        parametros: { diasAntes: 3, cadaDias: 1, maxIntentos: 5 },
        canales: ['APP', 'WEB'],
        plantilla: '{nombre}, el curso {curso} tiene fecha límite {fecha_limite}.',
    },
    {
        codigo: 'R9',
        nombre: 'Aprobación pendiente',
        descripcion: 'Recuerda una solicitud que sigue pendiente de aprobación.',
        destinatario: 'Quien debe aprobarla',
        seCierraCuando: 'Cuando la solicitud deja de estar pendiente.',
        campos: [CADA_DIAS, MAX_INTENTOS],
        variables: [NOMBRE, SOLICITUD],
        activo: true,
        parametros: { cadaDias: 1, maxIntentos: 5 },
        canales: ['APP', 'WEB', 'CORREO'],
        plantilla: '{nombre}, tienes pendiente la solicitud {solicitud}.',
    },
    {
        codigo: 'R10',
        nombre: 'Cambio de estatus',
        descripcion: 'Avisa a quien la solicitó cuando cambia el estatus.',
        destinatario: 'La persona que la solicitó',
        seCierraCuando: 'Un aviso por cada cambio de estatus.',
        campos: [],
        variables: [NOMBRE, SOLICITUD],
        activo: true,
        parametros: {},
        canales: ['APP', 'WEB', 'CORREO'],
        plantilla: '{nombre}, tu solicitud {solicitud} cambió de estatus.',
    },
    {
        codigo: 'R11',
        nombre: 'Comunicado pendiente',
        descripcion: 'Recuerda un comunicado pendiente. Cada cuánto se avisa lo define el comunicado.',
        destinatario: 'El destinatario del comunicado',
        seCierraCuando: 'Cuando la persona cumple el acuse, el comunicado deja de estar vigente o ya no está enviado.',
        campos: [],
        variables: [NOMBRE, TITULO],
        activo: true,
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
    if (codigo === 'R12') return soloEntero(crudo, claves, 'minutosAntes', 1, 180);
    if (codigo === 'R1' || codigo === 'R2') return soloEntero(crudo, claves, 'minutosDespues', 1, 240);
    if (codigo === 'R3') return soloHoraCorte(crudo, claves);
    if (codigo === 'R5') return soloDiasAntes(crudo, claves);
    if (codigo === 'R8') return ventanaCurso(crudo, claves);
    if (codigo === 'R4' || codigo === 'R6' || codigo === 'R7' || codigo === 'R9') return cadaDias(crudo, claves);
    return { ok: false, message: 'Esa regla de recordatorio no existe.' };
}

const TOKEN_PLANTILLA = /\{([a-zA-Z0-9_]+)\}/g;

/** Rechaza `{horaEntrada}` y cualquier token que el motor de esa regla no sustituye. `{Nombre}` sí vale. */
export function validarPlantilla(codigo: string, plantilla: string): { ok: true } | { ok: false; message: string } {
    const catalogo = reglaDefault(codigo);
    if (!catalogo) return { ok: false, message: 'Esa regla de recordatorio no existe.' };
    const permitidas = new Set(catalogo.variables.map((variable) => variable.token.slice(1, -1).toLowerCase()));
    const desconocidas: string[] = [];
    for (const match of plantilla.matchAll(TOKEN_PLANTILLA)) {
        const token = match[0];
        if (!permitidas.has(match[1].toLowerCase()) && !desconocidas.includes(token)) desconocidas.push(token);
    }
    if (desconocidas.length) {
        return { ok: false, message: `La plantilla usa variables que esta regla no tiene: ${desconocidas.join(', ')}.` };
    }
    return { ok: true };
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

function soloHoraCorte(
    crudo: Record<string, unknown>,
    claves: string[],
): { ok: true; parametros: Record<string, unknown> } | { ok: false; message: string } {
    if (claves.length !== 1 || claves[0] !== 'horaCorte') {
        return { ok: false, message: 'Indica solo horaCorte.' };
    }
    if (typeof crudo.horaCorte !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(crudo.horaCorte)) {
        return { ok: false, message: 'horaCorte debe tener el formato HH:mm.' };
    }
    return { ok: true, parametros: { horaCorte: crudo.horaCorte } };
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
