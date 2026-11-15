jest.mock('src/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHmac } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { GupshupStatusService } from './gupshup-status.service';

describe('GupshupStatusService', () => {
    const prisma = {
        waConsumo: { updateMany: jest.fn() },
        notificacionesEntregas: { updateMany: jest.fn() },
    };
    const secreto = 'clave-compartida';
    let service: GupshupStatusService;

    beforeEach(async () => {
        jest.clearAllMocks();
        prisma.waConsumo.updateMany.mockResolvedValue({ count: 1 });
        prisma.notificacionesEntregas.updateMany.mockResolvedValue({ count: 1 });
        const module = await Test.createTestingModule({
            providers: [
                GupshupStatusService,
                { provide: PrismaService, useValue: prisma },
                { provide: ConfigService, useValue: { get: (clave: string) => (clave === 'GUPSHUP_WEBHOOK_SECRET' ? secreto : '') } },
            ],
        }).compile();
        service = module.get(GupshupStatusService);
    });

    it('un fallido no cobrado queda en cero', async () => {
        await service.aplicar({ 'x-api-key': secreto }, { payload: { id: 'msg-1', type: 'failed' } });
        expect(prisma.waConsumo.updateMany).toHaveBeenCalledWith({
            where: { ProveedorMsgId: { in: ['msg-1'] } },
            data: { Estatus: 'FAILED', Costo: 0 },
        });
        expect(prisma.notificacionesEntregas.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', Costo: 0 }) }),
        );
    });

    it('un entregado conserva el costo congelado', async () => {
        const cuerpo = { payload: { id: 'msg-2', type: 'delivered' } };
        const firma = createHmac('sha256', secreto).update(JSON.stringify(cuerpo)).digest('hex');
        await service.aplicar({ 'x-gupshup-signature': firma }, cuerpo);
        expect(prisma.waConsumo.updateMany).toHaveBeenCalledWith({
            where: { ProveedorMsgId: { in: ['msg-2'] } },
            data: { Estatus: 'DELIVERED' },
        });
    });

    it('rechaza una firma que no coincide', async () => {
        await expect(service.aplicar({ 'x-api-key': 'otra' }, { payload: { id: 'msg-3', type: 'failed' } })).rejects.toMatchObject({
            status: 401,
        });
        expect(prisma.waConsumo.updateMany).not.toHaveBeenCalled();
    });

    it('acepta el secreto en el query token', async () => {
        await service.aplicar({}, { payload: { id: 'msg-4', type: 'delivered' } }, secreto);
        expect(prisma.waConsumo.updateMany).toHaveBeenCalledWith({
            where: { ProveedorMsgId: { in: ['msg-4'] } },
            data: { Estatus: 'DELIVERED' },
        });
    });

    it('sin secreto responde 503 y no acepta la clave de la API', async () => {
        const module = await Test.createTestingModule({
            providers: [
                GupshupStatusService,
                { provide: PrismaService, useValue: prisma },
                { provide: ConfigService, useValue: { get: (clave: string) => (clave === 'GUPSHUP_API_KEY' ? 'clave-api' : '') } },
            ],
        }).compile();
        const apagado = module.get(GupshupStatusService);
        await expect(
            apagado.aplicar({ 'x-api-key': 'clave-api' }, { payload: { id: 'msg-5', type: 'failed' } }),
        ).rejects.toMatchObject({
            status: 503,
            response: { code: 'WEBHOOK_NO_CONFIGURADO' },
        });
        expect(prisma.waConsumo.updateMany).not.toHaveBeenCalled();
    });
});
