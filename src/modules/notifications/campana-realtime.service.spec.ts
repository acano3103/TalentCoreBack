jest.mock('src/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('./gateways/websockets.gateway', () => ({ WebsocketGateway: class WebsocketGateway {} }));

import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { CampanaRealtimeService } from './campana-realtime.service';
import { WebsocketGateway } from './gateways/websockets.gateway';

describe('CampanaRealtimeService', () => {
    const prisma = { notificaciones: { findMany: jest.fn() } };
    const gateway = { sendNotificationToUser: jest.fn() };
    let service: CampanaRealtimeService;

    beforeEach(async () => {
        jest.clearAllMocks();
        prisma.notificaciones.findMany.mockResolvedValue([
            { Categoria: 'COMUNICADO' },
            { Categoria: 'COMUNICADO' },
            { Categoria: 'RECORDATORIO' },
        ]);
        const module = await Test.createTestingModule({
            providers: [
                CampanaRealtimeService,
                { provide: PrismaService, useValue: prisma },
                { provide: WebsocketGateway, useValue: gateway },
            ],
        }).compile();
        service = module.get(CampanaRealtimeService);
    });

    it('publica el aviso nuevo y el conteo en la sala del usuario', async () => {
        await service.publicar('user-1', 10, 3, {
            id: 'n1',
            titulo: 'Aviso',
            mensaje: 'Texto',
            categoria: 'COMUNICADO',
            prioridad: 'NORMAL',
            deepLink: null,
            creadoEn: new Date('2026-11-14T18:00:00.000Z'),
            leida: false,
        });
        expect(gateway.sendNotificationToUser).toHaveBeenNthCalledWith(
            1,
            'user-1',
            'notifications:new',
            expect.objectContaining({ id: 'n1', titulo: 'Aviso' }),
        );
        expect(gateway.sendNotificationToUser).toHaveBeenNthCalledWith(2, 'user-1', 'notifications:count', {
            companyId: 10,
            total: 3,
            porCategoria: [
                { categoria: 'COMUNICADO', total: 2 },
                { categoria: 'RECORDATORIO', total: 1 },
            ],
        });
    });
});
