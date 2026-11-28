import { ConflictException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
    it('deja la ventana en la respuesta del 409', () => {
        const json = jest.fn();
        const status = jest.fn().mockReturnValue({ json });
        const filter = new HttpExceptionFilter();
        const ventana = {
            estado: 'no_iniciada',
            desde: '2026-11-20T17:45:00.000Z',
            hasta: '2026-11-20T19:00:00.000Z',
        };

        filter.catch(
            new ConflictException({ code: 'FUERA_DE_VENTANA', message: 'Aún no abre.', ventana }),
            {
                switchToHttp: () => ({
                    getResponse: () => ({ status }),
                    getRequest: () => ({ method: 'POST', url: '/api/v2/mobile/companies/7/training/classes/attendance' }),
                }),
            } as any,
        );

        expect(status).toHaveBeenCalledWith(409);
        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                statusCode: 409,
                code: 'FUERA_DE_VENTANA',
                message: 'Aún no abre.',
                ventana,
            }),
        );
    });
});
