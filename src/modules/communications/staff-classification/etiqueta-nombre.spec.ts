import { mismaEtiqueta, normalizarNombreEtiqueta } from './etiqueta-nombre';

describe('nombre de etiqueta', () => {
    it('no distingue mayúsculas y colapsa espacios', () => {
        expect(normalizarNombreEtiqueta('  Turno   noche  ')).toBe('Turno noche');
        expect(mismaEtiqueta('Turno Noche', '  turno   noche')).toBe(true);
        expect(mismaEtiqueta('Niño', 'Nino')).toBe(false);
    });
});
