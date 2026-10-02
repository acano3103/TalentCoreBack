const DEFAULT_TIMEZONE = 'America/Mexico_City';
const WEEKDAYS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

function resolveTimeZone(timeZone?: string | null): string {
  const candidate =
    typeof timeZone === 'string' ? timeZone.trim() : '';
  const tz = candidate || DEFAULT_TIMEZONE;

  if (tz === DEFAULT_TIMEZONE && !candidate) {
    return DEFAULT_TIMEZONE;
  }

  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format();
    return tz;
  } catch (error) {
    if (error instanceof RangeError) {
      console.warn(
        `Zona horaria inválida "${timeZone}", se usa ${DEFAULT_TIMEZONE}`,
      );
      return DEFAULT_TIMEZONE;
    }
    throw error;
  }
}

/** Fecha calendario en la zona del sitio, como 'YYYY-MM-DD' */
export function localDateString(instant: Date, timeZone: string): string {
  const tz = resolveTimeZone(timeZone);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Fecha @db.Date lista para Prisma: medianoche UTC del día local */
export function localDateForPrisma(instant: Date, timeZone: string): Date {
  const [year, month, day] = localDateString(instant, timeZone)
    .split('-')
    .map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** 'Lunes' | 'Martes' | ... — debe empatar con HorariosEmpleado.DiaSemana */
export function localWeekdayName(instant: Date, timeZone: string): string {
  const [year, month, day] = localDateString(instant, timeZone)
    .split('-')
    .map(Number);
  const utcMidnight = new Date(Date.UTC(year, month - 1, day));
  return WEEKDAYS[utcMidnight.getUTCDay()];
}

function asUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number {
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function partsInZone(
  instant: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(instant);

  const valueOf = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);

  let hour = valueOf('hour');
  if (hour === 24) hour = 0;

  return {
    year: valueOf('year'),
    month: valueOf('month'),
    day: valueOf('day'),
    hour,
    minute: valueOf('minute'),
    second: valueOf('second'),
  };
}

function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const desiredMs = asUtcMs(year, month, day, hour, minute, second);
  let utcGuess = desiredMs;

  // Dos pases: el segundo corrige transiciones de DST.
  for (let i = 0; i < 2; i++) {
    const local = partsInZone(new Date(utcGuess), timeZone);
    const actualMs = asUtcMs(
      local.year,
      local.month,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    utcGuess -= actualMs - desiredMs;
  }

  return new Date(utcGuess);
}

/** Combina un día local con una hora @db.Time(0) y devuelve el instante UTC */
export function localTimeToInstant(
  localDate: string,
  time: Date,
  timeZone: string,
): Date {
  const tz = resolveTimeZone(timeZone);
  const [year, month, day] = localDate.split('-').map(Number);
  const hours = time.getUTCHours();
  const minutes = time.getUTCMinutes();
  const seconds = time.getUTCSeconds();

  return zonedLocalToUtc(year, month, day, hours, minutes, seconds, tz);
}

/** Minutos de diferencia entre dos instantes, redondeados hacia abajo */
export function diffMinutes(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 60_000);
}

/** Medianoche UTC de un día calendario YYYY-MM-DD. */
export function localDateToPrismaDate(localDate: string): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addLocalDays(localDate: string, days: number): string {
  const shifted = localDateToPrismaDate(localDate);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function inclusiveLocalDays(from: string, to: string): number {
  const start = localDateToPrismaDate(from).getTime();
  const end = localDateToPrismaDate(to).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Lunes y domingo de la semana ISO que contiene el día local, como @db.Date. */
export function isoWeekBounds(localDate: string): { inicio: Date; fin: Date } {
  const cursor = localDateToPrismaDate(localDate);
  const weekday = cursor.getUTCDay();
  const deltaToMonday = weekday === 0 ? -6 : 1 - weekday;
  const inicio = new Date(cursor);
  inicio.setUTCDate(cursor.getUTCDate() + deltaToMonday);
  const fin = new Date(inicio);
  fin.setUTCDate(inicio.getUTCDate() + 6);
  return { inicio, fin };
}

/** ISO-8601 con offset numérico, incluso cuando el desfase es cero. */
export function formatIsoWithOffset(date: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}${sign}${pad(hours)}:${pad(minutes)}`
  );
}
