import { diaLocal, esVigente, filtroComunicado, filtroEstadoDestinatario, filtroTipo } from './bandeja';

const ahora = new Date('2026-11-14T18:00:00.000Z');

describe('bandeja del empleado', () => {
    it('pendientes pide acuse, vigencia y que el destinatario no haya confirmado', () => {
        expect(filtroComunicado('pendientes', ahora)).toEqual({
            Estado: 'ENVIADO',
            AcuseModo: { in: ['LEIDO', 'LEI_ENTENDI'] },
            OR: [{ VigenteHasta: null }, { VigenteHasta: { gt: ahora } }],
        });
        expect(filtroEstadoDestinatario('pendientes')).toEqual({ notIn: ['CONFIRMADO', 'EXPIRADO'] });
    });

    it('archivados y todos no mezclan borradores', () => {
        expect(filtroComunicado('archivados', ahora)).toEqual({ Estado: 'ARCHIVADO' });
        expect(filtroComunicado('todos', ahora).Estado).toEqual({ in: ['ENVIADO', 'EXPIRADO', 'ENVIANDO'] });
        expect(filtroEstadoDestinatario('todos')).toBeUndefined();
    });

    it('un enviado con fecha vencida no está vigente', () => {
        expect(esVigente('ENVIADO', new Date('2026-11-14T17:00:00.000Z'), ahora)).toBe(false);
        expect(esVigente('ENVIADO', null, ahora)).toBe(true);
        expect(esVigente('ARCHIVADO', null, ahora)).toBe(false);
    });

    it('el tipo numérico es un id y el texto es un código', () => {
        expect(filtroTipo('12')).toEqual({ idTipo: 12 });
        expect(filtroTipo('POLITICA')).toEqual({ codigo: 'POLITICA' });
        expect(filtroTipo('  ')).toEqual({});
    });

    it('el día local usa la zona de la ubicación', () => {
        expect(diaLocal(ahora, 'America/Mexico_City')).toBe('2026-11-14');
        expect(diaLocal(new Date('2026-11-15T05:30:00.000Z'), 'America/Mexico_City')).toBe('2026-11-14');
    });
});
