import { emitirHecho } from './comms-hechos';

describe('emitirHecho', () => {
    it('no hace nada si no hay emisor', () => {
        expect(() => emitirHecho(null, 'comms.estatus', { estatus: 'APROBADA' })).not.toThrow();
        expect(() => emitirHecho(undefined, 'comms.estatus', { estatus: 'APROBADA' })).not.toThrow();
    });

    it('traga el error del emisor para no cambiar la respuesta HTTP', () => {
        const emisor = { emit: () => { throw new Error('caído'); } };
        expect(() => emitirHecho(emisor, 'comms.estatus', { estatus: 'APROBADA' })).not.toThrow();
    });

    it('entrega el payload cuando el emisor responde', () => {
        const emit = jest.fn().mockReturnValue(true);
        emitirHecho({ emit }, 'comms.documento', { tipo: 'FALTANTE' });
        expect(emit).toHaveBeenCalledWith('comms.documento', { tipo: 'FALTANTE' });
    });
});
