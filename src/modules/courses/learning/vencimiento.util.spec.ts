import { getVencimiento } from './vencimiento.util';

const base = { estatusAsignacion: 'inscrito', estatusSesion: 'en_curso' };
const ahora = new Date('2026-11-20T18:00:00.000Z');
const zona = 'America/Mexico_City';

describe('getVencimiento', () => {
    it('marca completado antes que una sesión finalizada o una fecha ya pasada', () => {
        expect(
            getVencimiento(
                { estatusAsignacion: 'completado', estatusSesion: 'finalizado', fechaFinPeriodo: new Date('2020-01-01T00:00:00.000Z') },
                ahora,
                zona,
            ),
        ).toEqual({ estado: 'completado', dias: null });
    });

    it('una sesión finalizada sin completar está vencida aunque la fecha siga abierta', () => {
        expect(
            getVencimiento(
                { estatusAsignacion: 'inscrito', estatusSesion: 'finalizado', fechaFinPeriodo: new Date('2026-12-01T18:00:00.000Z') },
                ahora,
                zona,
            ),
        ).toEqual({ estado: 'vencido', dias: null });
    });

    it('sin fecha de término no vence', () => {
        expect(getVencimiento({ ...base, fechaFinPeriodo: null }, ahora, zona)).toEqual({ estado: 'sin_fecha', dias: null });
    });

    it('si el instante de fin ya pasó, está vencido', () => {
        expect(
            getVencimiento({ ...base, fechaFinPeriodo: new Date('2026-11-20T17:00:00.000Z') }, ahora, zona),
        ).toEqual({ estado: 'vencido', dias: null });
    });

    it('el mismo instante de fin todavía no está vencido y vence hoy', () => {
        expect(getVencimiento({ ...base, fechaFinPeriodo: ahora }, ahora, zona)).toEqual({ estado: 'por_vencer', dias: 0 });
    });

    it('cuenta hoy en la zona de la empresa: 7 días en México es por vencer y 8 en UTC es vigente', () => {
        const fin = new Date('2026-11-28T02:00:00.000Z');
        expect(getVencimiento({ ...base, fechaFinPeriodo: fin }, ahora, zona)).toEqual({ estado: 'por_vencer', dias: 7 });
        expect(getVencimiento({ ...base, fechaFinPeriodo: fin }, ahora, 'UTC')).toEqual({ estado: 'vigente', dias: 8 });
    });

    it('un fin más tarde el mismo día local vence hoy', () => {
        expect(
            getVencimiento({ ...base, fechaFinPeriodo: new Date('2026-11-21T05:30:00.000Z') }, ahora, zona),
        ).toEqual({ estado: 'por_vencer', dias: 0 });
    });

    it('a 8 días locales sigue vigente', () => {
        expect(
            getVencimiento({ ...base, fechaFinPeriodo: new Date('2026-11-28T18:00:00.000Z') }, ahora, zona),
        ).toEqual({ estado: 'vigente', dias: 8 });
    });
});
