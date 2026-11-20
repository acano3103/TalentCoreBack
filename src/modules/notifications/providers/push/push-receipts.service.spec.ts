jest.mock('src/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { PushProvider } from './push.provider';
import { PushReceiptsService } from './push-receipts.service';

describe('PushReceiptsService', () => {
    const prisma = {
        catCanalesNotificaciones: { findUnique: jest.fn() },
        notificacionesEntregas: { findMany: jest.fn(), updateMany: jest.fn() },
        pushTokens: { updateMany: jest.fn() },
    };
    const push = { recibos: jest.fn() };

    beforeEach(async () => {
        jest.clearAllMocks();
        prisma.catCanalesNotificaciones.findUnique.mockResolvedValue({ id: 8, code: 'PUSH' });
        prisma.notificacionesEntregas.findMany.mockResolvedValue([{ ProveedorMsgId: 'ticket-1' }]);
        prisma.notificacionesEntregas.updateMany.mockResolvedValue({ count: 1 });
        prisma.pushTokens.updateMany.mockResolvedValue({ count: 1 });
        push.recibos.mockResolvedValue({
            'ticket-1': {
                status: 'error',
                message: 'ExponentPushToken[abc] is not a registered push notification recipient',
                details: { error: 'DeviceNotRegistered' },
            },
        });
        const module = await Test.createTestingModule({
            providers: [
                PushReceiptsService,
                { provide: PrismaService, useValue: prisma },
                { provide: PushProvider, useValue: push },
            ],
        }).compile();
        await module.get(PushReceiptsService).revisarRecibos();
    });

    it('da de baja el dispositivo que Expo ya no reconoce', () => {
        expect(prisma.pushTokens.updateMany).toHaveBeenCalledWith({
            where: { UltimoTicket: 'ticket-1', Activo: true },
            data: expect.objectContaining({ Activo: false, MotivoBaja: 'DeviceNotRegistered' }),
        });
        expect(prisma.notificacionesEntregas.updateMany).toHaveBeenCalledWith({
            where: { ProveedorMsgId: 'ticket-1' },
            data: expect.objectContaining({ status: 'FAILED' }),
        });
    });
});
