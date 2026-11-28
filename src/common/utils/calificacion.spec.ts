import { calificacionAprobada, normalizarCalificacion } from './calificacion';

describe('calificacion', () => {
  it.each([
    [9.5, 70, true],
    [6.9, 70, false],
    [7, 70, true],
    [6.95, 70, false],
    [85, 70, true],
    [69, 70, false],
    [8, 8, true],
    [null, 70, true],
    [10, 100, true],
    [0, 70, false],
  ])('calificación %s con umbral %s queda aprobada=%s', (calificacion, umbral, aprobada) => {
    expect(calificacionAprobada(calificacion, umbral)).toBe(aprobada);
  });

  it('redondea a 2 decimales después de pasar de escala 0-10 a 0-100', () => {
    expect(normalizarCalificacion(9.5, 70)).toBe(95);
    expect(normalizarCalificacion(6.95, 70)).toBe(69.5);
    expect(normalizarCalificacion(8, 8)).toBe(8);
  });

  it('usa 70 cuando el umbral es 0 o no es un número', () => {
    expect(calificacionAprobada(7, 0)).toBe(true);
    expect(calificacionAprobada(6.9, Number.NaN)).toBe(false);
  });
});
