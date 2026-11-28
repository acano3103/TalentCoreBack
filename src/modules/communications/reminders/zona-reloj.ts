import { localDateString, localWeekdayName } from 'src/modules/attendance/utils/timezone.util';

const ZONA_DEFAULT = 'America/Mexico_City';

export interface RelojLocal {
    fecha: string;
    minutos: number;
    dia: string;
}

export function zonaValida(zona: string | null | undefined): string {
    const candidata = zona?.trim() || ZONA_DEFAULT;
    try {
        Intl.DateTimeFormat('en-US', { timeZone: candidata }).format(new Date());
        return candidata;
    } catch {
        return ZONA_DEFAULT;
    }
}

export function relojLocal(instant: Date, zona: string | null | undefined): RelojLocal {
    const tz = zonaValida(zona);
    const partes = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(instant);
    const hora = Number(partes.find((parte) => parte.type === 'hour')?.value);
    const minuto = Number(partes.find((parte) => parte.type === 'minute')?.value);
    return {
        fecha: localDateString(instant, tz),
        dia: localWeekdayName(instant, tz),
        minutos: (hora === 24 ? 0 : hora) * 60 + minuto,
    };
}

export function mismoDia(a: string, b: string): boolean {
    return normalizarDia(a) === normalizarDia(b);
}

export function diasEntreFechas(desde: string, hasta: string): number {
    const inicio = Date.parse(`${desde}T00:00:00Z`);
    const fin = Date.parse(`${hasta}T00:00:00Z`);
    return Math.round((fin - inicio) / 86_400_000);
}

export function inicioDiaLocal(fecha: string, zona: string): Date {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const supuesto = Date.UTC(anio, mes - 1, dia, 0, 0, 0);
    const offset = offsetMinutos(new Date(supuesto), zonaValida(zona));
    const ajustado = new Date(supuesto - offset * 60_000);
    const offset2 = offsetMinutos(ajustado, zonaValida(zona));
    return offset2 === offset ? ajustado : new Date(supuesto - offset2 * 60_000);
}

function offsetMinutos(fecha: Date, zona: string): number {
    const reloj = relojLocal(fecha, zona);
    const [anio, mes, dia] = reloj.fecha.split('-').map(Number);
    const comoUtc = Date.UTC(anio, mes - 1, dia, Math.floor(reloj.minutos / 60), reloj.minutos % 60, 0);
    return Math.round((comoUtc - fecha.getTime()) / 60_000);
}

function normalizarDia(valor: string): string {
    return valor
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}
