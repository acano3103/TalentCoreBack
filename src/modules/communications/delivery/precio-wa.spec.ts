import { precioVigente } from './precio-wa';

describe('precio de WhatsApp', () => {
    const globalEnero = {
        idTenant: null,
        precioBase: 0.4,
        preciosCategoria: null,
        moneda: 'MXN',
        vigenteDesde: new Date('2026-01-01T00:00:00.000Z'),
    };
    const tenantEnero = {
        idTenant: 3,
        precioBase: 0.8,
        preciosCategoria: { CRITICA: 0.95 },
        moneda: 'MXN',
        vigenteDesde: new Date('2026-01-01T00:00:00.000Z'),
    };
    const tenantMitad = {
        idTenant: 3,
        precioBase: 1.2,
        preciosCategoria: null,
        moneda: 'MXN',
        vigenteDesde: new Date('2026-11-16T00:00:00.000Z'),
    };

    it('antes del cambio de mitad de mes usa el precio vigente del tenant', () => {
        const precio = precioVigente([globalEnero, tenantEnero, tenantMitad], 3, new Date('2026-11-10T12:00:00.000Z'), 'IMPORTANTE');
        expect(precio).toEqual({ precio: 0.8, moneda: 'MXN' });
    });

    it('después del cambio usa el precio nuevo y no el global', () => {
        const precio = precioVigente([globalEnero, tenantEnero, tenantMitad], 3, new Date('2026-11-20T12:00:00.000Z'), 'IMPORTANTE');
        expect(precio).toEqual({ precio: 1.2, moneda: 'MXN' });
    });

    it('sin tarifa del tenant usa la global', () => {
        const precio = precioVigente([globalEnero, tenantMitad], 9, new Date('2026-11-20T12:00:00.000Z'), 'NORMAL');
        expect(precio).toEqual({ precio: 0.4, moneda: 'MXN' });
    });

    it('respeta el precio de la categoría cuando existe', () => {
        const precio = precioVigente([tenantEnero], 3, new Date('2026-06-01T00:00:00.000Z'), 'CRITICA');
        expect(precio?.precio).toBe(0.95);
    });
});
