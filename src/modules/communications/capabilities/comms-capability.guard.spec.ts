jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CommsCapabilityGuard } from './comms-capability.guard';
import { CommsCapabilityService } from './comms-capability.service';

const usuario = { id: 7, idTenant: 3, uuid: 'user-uuid' } as ActiveUserDto;

function contexto(params: Record<string, string> = {}) {
    const request: {
        user?: ActiveUserDto;
        params: Record<string, string>;
        commsScope?: unknown;
    } = { user: usuario, params };
    const context = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { request, context };
}

describe('CommsCapabilityGuard', () => {
    const getAllAndOverride = jest.fn();
    const getEffective = jest.fn();
    const reflector = { getAllAndOverride } as unknown as Reflector;
    const service = { getEffective } as unknown as CommsCapabilityService;
    const guard = new CommsCapabilityGuard(reflector, service);

    beforeEach(() => {
        getAllAndOverride.mockReset();
        getEffective.mockReset();
    });

    it('deja pasar la ruta que no pide capacidad', async () => {
        getAllAndOverride.mockReturnValue(undefined);
        const { context } = contexto();

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(getEffective).not.toHaveBeenCalled();
    });

    it('responde 403 con code cuando el usuario no tiene la capacidad', async () => {
        getAllAndOverride.mockReturnValue('CFG_PERMISOS');
        getEffective.mockResolvedValue([]);
        const { context } = contexto({ companyId: '9' });

        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(HttpException);
        try {
            await guard.canActivate(context);
        } catch (error) {
            const http = error as HttpException;
            expect(http.getStatus()).toBe(403);
            expect(http.getResponse()).toMatchObject({ code: 'SIN_CAPACIDAD' });
        }
    });

    it('guarda el alcance en la petición cuando la capacidad sí está', async () => {
        getAllAndOverride.mockReturnValue('COM_CREAR');
        getEffective.mockResolvedValue([
            {
                codigo: 'COM_CREAR',
                alcance: 'EQUIPO_DIRECTO',
                referencias: null,
                tiposPermitidos: ['AVISO_EQUIPO'],
            },
        ]);
        const { request, context } = contexto({ companyId: '9' });

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(getEffective).toHaveBeenCalledWith(usuario, 9);
        expect(request.commsScope).toEqual({
            capacidad: 'COM_CREAR',
            alcance: 'EQUIPO_DIRECTO',
            tiposPermitidos: ['AVISO_EQUIPO'],
        });
    });

    it('acepta cualquiera de las capacidades y se queda con el alcance más amplio', async () => {
        getAllAndOverride.mockReturnValue(['CFG_CANALES', 'COM_VER_ANALITICA']);
        getEffective.mockResolvedValue([
            { codigo: 'COM_VER_ANALITICA', alcance: 'EMPRESAS', referencias: [10], tiposPermitidos: null },
            { codigo: 'CFG_CANALES', alcance: 'TENANT', referencias: null, tiposPermitidos: null },
        ]);
        const { request, context } = contexto({ companyId: '9' });

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(request.commsScope).toMatchObject({ capacidad: 'CFG_CANALES', alcance: 'TENANT' });
    });
});
