import {
  addLocalDays,
  diffMinutes,
  formatIsoWithOffset,
  inclusiveLocalDays,
  isoWeekBounds,
  localDateForPrisma,
  localDateString,
  localDateToPrismaDate,
  localTimeToInstant,
  localWeekdayName,
} from './timezone.util';

describe('timezone.util', () => {
  const mexico = 'America/Mexico_City';

  describe('turno vespertino (bug de jornada UTC)', () => {
    const checada = new Date('2026-09-21T01:30:00Z');

    it('asigna la fecha local del domingo, no el lunes UTC', () => {
      expect(localDateString(checada, mexico)).toBe('2026-09-20');
      expect(localWeekdayName(checada, mexico)).toBe('Domingo');
    });

    it('expone la fecha Prisma como medianoche UTC del día local', () => {
      expect(localDateForPrisma(checada, mexico).toISOString()).toBe(
        '2026-09-20T00:00:00.000Z',
      );
    });
  });

  it('una checada diurna en México cae en el mismo día calendario', () => {
    const checada = new Date('2026-09-21T13:00:00Z');
    expect(localDateString(checada, mexico)).toBe('2026-09-21');
    expect(localWeekdayName(checada, mexico)).toBe('Lunes');
  });

  it('Tijuana y Cancún dan días distintos en el mismo instante frontera', () => {
    const frontera = new Date('2026-09-21T06:30:00Z');

    expect(localDateString(frontera, 'America/Tijuana')).toBe('2026-09-20');
    expect(localWeekdayName(frontera, 'America/Tijuana')).toBe('Domingo');

    expect(localDateString(frontera, 'America/Cancun')).toBe('2026-09-21');
    expect(localWeekdayName(frontera, 'America/Cancun')).toBe('Lunes');
  });

  it('combina un @db.Time(0) de Prisma con el día local sin usar toString', () => {
    const horaPrisma = new Date('1970-01-01T08:00:00Z');
    const instante = localTimeToInstant('2026-09-21', horaPrisma, mexico);

    expect(instante.toISOString()).toBe('2026-09-21T14:00:00.000Z');
  });

  it('una zona horaria inválida cae al default sin lanzar', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const checada = new Date('2026-09-21T01:30:00Z');

    expect(() => localDateString(checada, 'Zona/Inventada')).not.toThrow();
    expect(localDateString(checada, 'Zona/Inventada')).toBe('2026-09-20');
    expect(localWeekdayName(checada, 'Zona/Inventada')).toBe('Domingo');
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it('null, undefined o vacío usan America/Mexico_City', () => {
    const checada = new Date('2026-09-21T01:30:00Z');

    expect(localDateString(checada, '')).toBe('2026-09-20');
    expect(localDateString(checada, null as unknown as string)).toBe(
      '2026-09-20',
    );
    expect(localDateString(checada, undefined as unknown as string)).toBe(
      '2026-09-20',
    );
  });

  it('diffMinutes redondea hacia abajo', () => {
    const from = new Date('2026-09-21T08:00:00Z');
    const to = new Date('2026-09-21T08:05:59Z');

    expect(diffMinutes(from, to)).toBe(5);
    expect(diffMinutes(to, from)).toBe(-6);
  });

  it('suma días calendario sin depender de la zona del proceso', () => {
    expect(addLocalDays('2026-09-27', -29)).toBe('2026-08-29');
    expect(localDateToPrismaDate('2026-09-27').toISOString()).toBe(
      '2026-09-27T00:00:00.000Z',
    );
  });

  it('cuenta días inclusivos y la semana ISO del domingo local', () => {
    expect(inclusiveLocalDays('2026-01-01', '2026-03-31')).toBe(90);
    expect(inclusiveLocalDays('2026-01-01', '2026-04-01')).toBe(91);
    expect(isoWeekBounds('2026-09-27')).toEqual({
      inicio: new Date('2026-09-21T00:00:00.000Z'),
      fin: new Date('2026-09-27T00:00:00.000Z'),
    });
  });

  it('formatea la hora del servidor con offset y conserva el instante', () => {
    const instante = new Date('2026-09-28T06:30:00.000Z');
    const texto = formatIsoWithOffset(instante);

    expect(texto).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/,
    );
    expect(texto.endsWith('Z')).toBe(false);
    expect(Date.parse(texto)).toBe(instante.getTime());
  });
});
