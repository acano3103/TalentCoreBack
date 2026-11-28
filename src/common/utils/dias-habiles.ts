import { localDateString } from 'src/modules/attendance/utils/timezone.util';

const ZONA = 'America/Mexico_City';

/**
 * Días inhábiles del art. 74 de la LFT: sábados, domingos y los festivos
 * obligatorios. Las jornadas electorales no tienen fecha fija y no están aquí.
 * legal-workday no guarda este catálogo.
 */
export function hoy(zona?: string | null, ahora = new Date()): string {
  const candidata = zona?.trim();
  return localDateString(ahora, candidata || ZONA);
}

export function esFinDeSemana(dia: string): boolean {
  const dow = new Date(fechaUtc(dia)).getUTCDay();
  return dow === 0 || dow === 6;
}

export function esFestivoObligatorio(dia: string): boolean {
  return festivosDelAnio(Number(dia.slice(0, 4))).has(dia);
}

export function esHabil(dia: string): boolean {
  return !esFinDeSemana(dia) && !esFestivoObligatorio(dia);
}

/** Suma días hábiles posteriores a `desde`. El día de inicio no cuenta. */
export function sumar(desde: string, diasHabiles: number): string {
  if (diasHabiles <= 0) return desde;
  let restantes = diasHabiles;
  let cursor = desde;
  while (restantes > 0) {
    cursor = siguiente(cursor);
    if (esHabil(cursor)) restantes -= 1;
  }
  return cursor;
}

/** Días hábiles entre `desde` (exclusivo) y `hasta` (inclusivo). */
export function contar(desde: string, hasta: string): number {
  if (hasta <= desde) return 0;
  let total = 0;
  let cursor = desde;
  while (cursor < hasta) {
    cursor = siguiente(cursor);
    if (esHabil(cursor)) total += 1;
  }
  return total;
}

function siguiente(dia: string): string {
  const fecha = new Date(fechaUtc(dia));
  fecha.setUTCDate(fecha.getUTCDate() + 1);
  return diaDe(fecha);
}

function fechaUtc(dia: string): number {
  const [anio, mes, numero] = dia.split('-').map(Number);
  return Date.UTC(anio, mes - 1, numero);
}

function festivosDelAnio(anio: number): Set<string> {
  const dias = new Set<string>([
    `${anio}-01-01`,
    lunesN(anio, 2, 1),
    lunesN(anio, 3, 3),
    `${anio}-05-01`,
    `${anio}-09-16`,
    lunesN(anio, 11, 3),
    `${anio}-12-25`,
  ]);
  if ((anio - 2018) % 6 === 0) dias.add(`${anio}-12-01`);
  return dias;
}

/** El enésimo lunes del mes (1 = enero). */
function lunesN(anio: number, mes: number, n: number): string {
  const primero = new Date(Date.UTC(anio, mes - 1, 1));
  const avance = (8 - primero.getUTCDay()) % 7;
  const dia = 1 + avance + (n - 1) * 7;
  return diaDe(new Date(Date.UTC(anio, mes - 1, dia)));
}

function diaDe(fecha: Date): string {
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  return `${fecha.getUTCFullYear()}-${mes}-${dia}`;
}
