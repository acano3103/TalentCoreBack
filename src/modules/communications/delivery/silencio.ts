export interface Turno {
    dia: string;
    entrada: number;
    salida: number;
}

export interface SilencioEmpresa {
    activo: boolean;
    inicio: string;
    fin: string;
}

export interface EntradaSilencio {
    ahora: Date;
    zonaHoraria: string;
    turnos: readonly Turno[];
    prioridad: string;
    /** WEB, el registro in-app y el kiosco no esperan al turno. */
    canalInmediato: boolean;
    silencio: SilencioEmpresa | null;
}

export interface DecisionSilencio {
    inmediato: boolean;
    en: Date;
}

const ZONA_DEFAULT = 'America/Mexico_City';

/**
 * Fuera del turno del empleado, push, WhatsApp y correo esperan al siguiente inicio.
 * La zona es la de su ubicación. CRÍTICA no espera. Si la empresa apagó el silencio,
 * tampoco se difiere por turno. Sin turno y con silencio activo, se usa esa ventana.
 */
export function decisionSilencio(entrada: EntradaSilencio): DecisionSilencio {
    if (entrada.prioridad === 'CRITICA' || entrada.canalInmediato || entrada.silencio?.activo === false) {
        return { inmediato: true, en: entrada.ahora };
    }
    const zona = zonaValida(entrada.zonaHoraria);
    const partes = partesZona(entrada.ahora, zona);
    const minutos = partes.hora * 60 + partes.minuto;
    if (entrada.turnos.length) {
        const hoy = entrada.turnos.filter((turno) => mismoDia(turno.dia, partes.diaSemana));
        if (hoy.some((turno) => dentroDeTurno(minutos, turno.entrada, turno.salida))) {
            return { inmediato: true, en: entrada.ahora };
        }
        const siguiente = siguienteTurno(entrada.ahora, zona, entrada.turnos);
        if (!siguiente) return { inmediato: true, en: entrada.ahora };
        return { inmediato: false, en: siguiente };
    }
    if (!entrada.silencio?.activo) return { inmediato: true, en: entrada.ahora };
    const fin = finDeSilencio(entrada.ahora, zona, entrada.silencio.inicio, entrada.silencio.fin);
    if (fin.getTime() <= entrada.ahora.getTime()) return { inmediato: true, en: entrada.ahora };
    return { inmediato: false, en: fin };
}

export function minutosDeReloj(fecha: Date | null): number | null {
    if (!fecha || Number.isNaN(fecha.getTime())) return null;
    return fecha.getUTCHours() * 60 + fecha.getUTCMinutes();
}

function dentroDeTurno(minutos: number, entrada: number, salida: number): boolean {
    if (entrada === salida) return false;
    if (salida > entrada) return minutos >= entrada && minutos < salida;
    return minutos >= entrada || minutos < salida;
}

function siguienteTurno(ahora: Date, zona: string, turnos: readonly Turno[]): Date | null {
    const hoy = partesZona(ahora, zona);
    let elegido: Date | null = null;
    for (let offset = 0; offset < 8; offset += 1) {
        const fecha = sumarDias(hoy, offset);
        const dia = diaDeCalendario(fecha, zona);
        for (const turno of turnos) {
            if (!mismoDia(turno.dia, dia)) continue;
            const inicio = instanteEnZona(fecha.anio, fecha.mes, fecha.dia, Math.floor(turno.entrada / 60), turno.entrada % 60, zona);
            if (inicio.getTime() <= ahora.getTime()) continue;
            if (!elegido || inicio.getTime() < elegido.getTime()) elegido = inicio;
        }
    }
    return elegido;
}

function finDeSilencio(ahora: Date, zona: string, inicio: string, fin: string): Date {
    const partes = partesZona(ahora, zona);
    const minutos = partes.hora * 60 + partes.minuto;
    const desde = hhmm(inicio);
    const hasta = hhmm(fin);
    if (desde == null || hasta == null || desde === hasta) return ahora;
    const enSilencio = desde > hasta ? minutos >= desde || minutos < hasta : minutos >= desde && minutos < hasta;
    if (!enSilencio) return ahora;
    const hora = Math.floor(hasta / 60);
    const minuto = hasta % 60;
    const hoy = instanteEnZona(partes.anio, partes.mes, partes.dia, hora, minuto, zona);
    if (hoy.getTime() > ahora.getTime()) return hoy;
    const manana = sumarDias(partes, 1);
    return instanteEnZona(manana.anio, manana.mes, manana.dia, hora, minuto, zona);
}

function instanteEnZona(anio: number, mes: number, dia: number, hora: number, minuto: number, zona: string): Date {
    const supuesto = Date.UTC(anio, mes - 1, dia, hora, minuto, 0);
    const offset = offsetMinutos(new Date(supuesto), zona);
    const ajustado = new Date(supuesto - offset * 60_000);
    const offset2 = offsetMinutos(ajustado, zona);
    if (offset2 === offset) return ajustado;
    return new Date(supuesto - offset2 * 60_000);
}

function offsetMinutos(fecha: Date, zona: string): number {
    const partes = partesZona(fecha, zona);
    const comoUtc = Date.UTC(partes.anio, partes.mes - 1, partes.dia, partes.hora, partes.minuto, partes.segundo);
    return Math.round((comoUtc - fecha.getTime()) / 60_000);
}

interface Partes {
    anio: number;
    mes: number;
    dia: number;
    hora: number;
    minuto: number;
    segundo: number;
    diaSemana: string;
}

function partesZona(fecha: Date, zona: string): Partes {
    const formato = new Intl.DateTimeFormat('en-US', {
        timeZone: zona,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
    });
    const mapa = new Map(formato.formatToParts(fecha).map((parte) => [parte.type, parte.value]));
    const hora = Number(mapa.get('hour'));
    return {
        anio: Number(mapa.get('year')),
        mes: Number(mapa.get('month')),
        dia: Number(mapa.get('day')),
        hora: hora === 24 ? 0 : hora,
        minuto: Number(mapa.get('minute')),
        segundo: Number(mapa.get('second')),
        diaSemana: diaDesdeCorto(mapa.get('weekday') ?? ''),
    };
}

function diaDeCalendario(fecha: { anio: number; mes: number; dia: number }, zona: string): string {
    const medio = instanteEnZona(fecha.anio, fecha.mes, fecha.dia, 12, 0, zona);
    return partesZona(medio, zona).diaSemana;
}

function sumarDias(fecha: { anio: number; mes: number; dia: number }, dias: number): { anio: number; mes: number; dia: number } {
    const utc = new Date(Date.UTC(fecha.anio, fecha.mes - 1, fecha.dia + dias));
    return { anio: utc.getUTCFullYear(), mes: utc.getUTCMonth() + 1, dia: utc.getUTCDate() };
}

function diaDesdeCorto(corto: string): string {
    const mapa: Record<string, string> = {
        Mon: 'lunes',
        Tue: 'martes',
        Wed: 'miercoles',
        Thu: 'jueves',
        Fri: 'viernes',
        Sat: 'sabado',
        Sun: 'domingo',
    };
    return mapa[corto] ?? normalizarDia(corto);
}

function mismoDia(a: string, b: string): boolean {
    return normalizarDia(a) === normalizarDia(b);
}

function normalizarDia(valor: string): string {
    return valor
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function hhmm(valor: string): number | null {
    const coincide = /^(\d{1,2}):(\d{2})$/.exec(valor.trim());
    if (!coincide) return null;
    const hora = Number(coincide[1]);
    const minuto = Number(coincide[2]);
    if (hora > 23 || minuto > 59) return null;
    return hora * 60 + minuto;
}

function zonaValida(zona: string): string {
    try {
        Intl.DateTimeFormat('en-US', { timeZone: zona || ZONA_DEFAULT }).format(new Date());
        return zona || ZONA_DEFAULT;
    } catch {
        return ZONA_DEFAULT;
    }
}
