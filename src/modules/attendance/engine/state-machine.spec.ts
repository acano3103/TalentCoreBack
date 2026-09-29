import { siguienteAccion, TipoChecada } from './state-machine';

describe('siguienteAccion', () => {
  describe('ALTERNANTE_SIMPLE', () => {
    it('recorre entrada y salida y se detiene', () => {
      expect(siguienteAccion(null, 'ALTERNANTE_SIMPLE', false)).toEqual({
        sugerido: 'ENTRADA',
        permitidos: ['ENTRADA'],
      });
      expect(siguienteAccion('ENTRADA', 'ALTERNANTE_SIMPLE', false)).toEqual({
        sugerido: 'SALIDA',
        permitidos: ['SALIDA'],
      });
      expect(siguienteAccion('SALIDA', 'ALTERNANTE_SIMPLE', false)).toEqual({
        sugerido: null,
        permitidos: [],
      });
    });

    it('no ofrece INICIO_COMIDA en ningún estado', () => {
      const estados: Array<TipoChecada | null> = [
        null,
        'ENTRADA',
        'SALIDA',
        'INICIO_COMIDA',
        'FIN_COMIDA',
      ];

      for (const estado of estados) {
        const accion = siguienteAccion(estado, 'ALTERNANTE_SIMPLE', true);
        expect(accion.permitidos).not.toContain('INICIO_COMIDA');
        expect(accion.permitidos).not.toContain('FIN_COMIDA');
        expect(accion.sugerido).not.toBe('INICIO_COMIDA');
        expect(accion.sugerido).not.toBe('FIN_COMIDA');
      }
    });
  });

  describe('SECUENCIA_COMPLETA', () => {
    it('recorre los cuatro pasos y cierra', () => {
      const pasos: TipoChecada[] = [
        'ENTRADA',
        'INICIO_COMIDA',
        'FIN_COMIDA',
        'SALIDA',
      ];
      let ultimo: TipoChecada | null = null;

      for (const esperado of pasos) {
        const accion = siguienteAccion(ultimo, 'SECUENCIA_COMPLETA', true);
        expect(accion.sugerido).toBe(esperado);
        expect(accion.permitidos[0]).toBe(esperado);
        ultimo = esperado;
      }

      expect(siguienteAccion('SALIDA', 'SECUENCIA_COMPLETA', true)).toEqual({
        sugerido: null,
        permitidos: [],
      });
    });

    it('con comida no obligatoria sugiere SALIDA y sigue permitiendo la comida', () => {
      const accion = siguienteAccion('ENTRADA', 'SECUENCIA_COMPLETA', false);
      expect(accion.sugerido).toBe('SALIDA');
      expect(accion.permitidos).toEqual(['INICIO_COMIDA', 'SALIDA']);
    });
  });
});
