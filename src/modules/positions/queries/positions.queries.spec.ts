jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { PrismaService } from 'src/prisma/prisma.service';
import { PositionQueries } from './positions.queries';

describe('PositionQueries.findAll', () => {
    it('agrega tipoPersonal y etiquetas y conserva las columnas del listado', async () => {
        const queryRaw = jest.fn()
            .mockResolvedValueOnce([{
                idPuesto: 4,
                NombrePuesto: 'Cajero',
                Area: 'Tienda',
                idTipoPersonalClasificacion: 2,
                codigoTipoPersonal: 'OPERATIVO',
                nombreTipoPersonal: 'Operativo',
            }])
            .mockResolvedValueOnce([{ total: 1n }]);
        const prisma = {
            $queryRaw: queryRaw,
            relPuestoEtiqueta: {
                findMany: jest.fn().mockResolvedValue([{
                    idPuesto: 4,
                    CatEtiquetasPuesto: { idEtiqueta: 9, Nombre: 'Turno noche' },
                }]),
            },
        };

        const resultado = await PositionQueries.findAll(prisma as unknown as PrismaService, 1, 2, '', 1, 10, 1);

        expect(resultado.total).toBe(1);
        expect(resultado.positions[0]).toEqual({
            idPuesto: 4,
            NombrePuesto: 'Cajero',
            Area: 'Tienda',
            tipoPersonal: { id: 2, codigo: 'OPERATIVO', nombre: 'Operativo' },
            etiquetas: [{ id: 9, nombre: 'Turno noche' }],
        });
        expect(String(queryRaw.mock.calls[0][0])).toContain('CatTiposPersonal');
    });
});
