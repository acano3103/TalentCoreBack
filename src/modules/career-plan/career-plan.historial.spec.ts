import {
  describirHistorial,
  idsPuestosDeHistorial,
  textoPostulacion,
} from './career-plan.historial';

describe('historial legible', () => {
  it('arma la postulación con la persona y los nombres de los puestos', () => {
    expect(
      textoPostulacion(
        'Michael Guevara',
        'Product Owner',
        'Desarrollador Full Stack Senior',
      ),
    ).toBe(
      'Postulado por Michael Guevara: Product Owner → Desarrollador Full Stack Senior',
    );
  });

  it('resuelve los ids del texto ya guardado', () => {
    const guardado =
      'Colaborador 136 postulado a la ruta (puesto 41 -> 40) por Michael Guevara';
    const puestos = new Map<number, string>([
      [41, 'Product Owner'],
      [40, 'Desarrollador Full Stack Senior'],
    ]);

    expect(idsPuestosDeHistorial(guardado)).toEqual([41, 40]);
    expect(describirHistorial(guardado, puestos)).toBe(
      'Postulado por Michael Guevara: Product Owner → Desarrollador Full Stack Senior',
    );
  });

  it('deja intacto un texto que ya es legible', () => {
    const texto =
      'Postulado por Ana Lopez: Analista → Líder';

    expect(idsPuestosDeHistorial(texto)).toEqual([]);
    expect(describirHistorial(texto, new Map())).toBe(texto);
  });
});
