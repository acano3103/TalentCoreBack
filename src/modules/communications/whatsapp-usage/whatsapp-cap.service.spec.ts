jest.mock('src/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('src/modules/notifications/notification.dispatcher', () => ({ NotificationDispatcher: class NotificationDispatcher {} }));

import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { WhatsAppCapService } from './whatsapp-cap.service';

describe('WhatsAppCapService', () => {
    const dispatchComms = jest.fn();
    let aviso: string | null = null;
    const prisma = {
        waConsumo: { aggregate: jest.fn() },
        waTopes: { findMany: jest.fn(), updateMany: jest.fn() },
        waPrecios: { findMany: jest.fn() },
        catEmpresas: { findFirst: jest.fn() },
        $queryRaw: jest.fn(),
    };
    const service = new WhatsAppCapService(
        prisma as unknown as PrismaService,
        { dispatchComms } as unknown as NotificationDispatcher,
        { get: () => 'https://app.ejemplo' } as unknown as ConfigService,
    );
    const ahora = new Date('2026-11-14T18:00:00.000Z');

    beforeEach(() => {
        aviso = null;
        jest.clearAllMocks();
        dispatchComms.mockReset();
        dispatchComms.mockResolvedValue({ notificationId: 'n', entregas: [] });
        prisma.waConsumo.aggregate.mockResolvedValue({ _sum: { Costo: 80 } });
        prisma.waTopes.findMany.mockImplementation(async () => [
            { id: 1, idEmpresa: null, TopeMensual: 100, Accion: 'BLOQUEAR', Aviso80Mes: aviso, Activo: true },
        ]);
        prisma.waTopes.updateMany.mockImplementation(async () => {
            if (aviso === '2026-11') return { count: 0 };
            aviso = '2026-11';
            return { count: 1 };
        });
        prisma.$queryRaw.mockResolvedValue([{ uuid: 'u-1', email: 'ana@ejemplo.com', nombre: 'Ana' }]);
        prisma.catEmpresas.findFirst.mockResolvedValue({ nombre_comercial: 'Acme' });
    });

    it('deja pasar la crítica aunque el tope esté lleno', async () => {
        prisma.waConsumo.aggregate.mockResolvedValue({ _sum: { Costo: 150 } });
        await expect(service.canSend(3, 10, 'CRITICA', ahora)).resolves.toBe(true);
        await expect(service.canSend(3, 10, 'NORMAL', ahora)).resolves.toBe(false);
        await expect(service.canSend(3, 10, 'IMPORTANTE', ahora)).resolves.toBe(false);
    });

    it('avisa al 80 % una sola vez en el mes, por sistema y por correo', async () => {
        await expect(service.revisarAviso(3, 10, ahora)).resolves.toBe(true);
        await expect(service.revisarAviso(3, 10, new Date('2026-11-20T18:00:00.000Z'))).resolves.toBe(false);
        expect(dispatchComms).toHaveBeenCalledTimes(1);
        expect(dispatchComms.mock.calls[0][1]).toMatchObject({
            categoria: 'SISTEMA',
            origenTipo: 'TOPE_WHATSAPP',
            correo: { to: 'ana@ejemplo.com' },
        });
        expect(dispatchComms.mock.calls[0][2]).toEqual([
            { codigo: 'SOCKETS', enviarAhora: true },
            { codigo: 'EMAIL', enviarAhora: true },
        ]);
    });

    it('no avisa por debajo del 80 %', async () => {
        prisma.waConsumo.aggregate.mockResolvedValue({ _sum: { Costo: 79 } });
        await expect(service.revisarAviso(3, 10, ahora)).resolves.toBe(false);
        expect(dispatchComms).not.toHaveBeenCalled();
        expect(prisma.waTopes.updateMany).not.toHaveBeenCalled();
    });
});
