import { armarConteo, whereNoLeidas } from './campana';

describe('conteo de la campana', () => {
    const ahora = new Date('2026-11-14T18:00:00.000Z');

    it('suma no leídas por categoría', () => {
        expect(armarConteo(10, ['RECORDATORIO', 'RECORDATORIO', 'COMUNICADO', null, '  '])).toEqual({
            companyId: 10,
            total: 5,
            porCategoria: [
                { categoria: 'COMUNICADO', total: 1 },
                { categoria: 'GENERAL', total: 2 },
                { categoria: 'RECORDATORIO', total: 2 },
            ],
        });
    });

    it('solo cuenta vigentes de la empresa o sin empresa', () => {
        expect(whereNoLeidas({ userUuid: 'user-1', companyId: 10, idTenant: 3, ahora, categoria: 'AVISO' })).toEqual({
            AND: [
                { user_uuid: 'user-1' },
                { read_at: null },
                { OR: [{ ExpiraEn: null }, { ExpiraEn: { gt: ahora } }] },
                { OR: [{ idEmpresa: 10 }, { idEmpresa: null }] },
                { OR: [{ idTenant: 3 }, { idTenant: null }] },
                { Categoria: 'AVISO' },
            ],
        });
    });
});
