import { contar, esHabil, sumar } from './dias-habiles';

describe('dias hábiles', () => {
  it('sumar 20 días desde el 18-dic-2026 salta el 25 de diciembre y el 1 de enero', () => {
    expect(sumar('2026-12-18', 20)).toBe('2027-01-19');
  });

  it('contar devuelve los mismos días hábiles que sumar', () => {
    expect(contar('2026-12-18', sumar('2026-12-18', 20))).toBe(20);
    expect(contar('2026-12-18', '2026-12-18')).toBe(0);
  });

  it('no cuenta sábados, domingos ni el 1 de mayo', () => {
    expect(esHabil('2026-05-01')).toBe(false);
    expect(esHabil('2026-05-02')).toBe(false);
    expect(esHabil('2026-05-03')).toBe(false);
    expect(esHabil('2026-05-04')).toBe(true);
    expect(sumar('2026-11-26', 1)).toBe('2026-11-27');
  });
});
