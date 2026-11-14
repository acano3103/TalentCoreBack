jest.mock('src/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('./providers/mail/mail.provider', () => ({ MailProvider: class MailProvider {} }));
jest.mock('./providers/whatsapp/whatsapp.provider', () => ({ WhatsappProvider: class WhatsappProvider {} }));
jest.mock('./providers/websocket/websocket.provider', () => ({ WebsocketProvider: class WebsocketProvider {} }));
jest.mock('./providers/push/push.provider', () => ({ PushProvider: class PushProvider {} }));

import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationDispatcher } from './notification.dispatcher';
import { MailProvider } from './providers/mail/mail.provider';
import { PushProvider } from './providers/push/push.provider';
import { WebsocketProvider } from './providers/websocket/websocket.provider';
import { WhatsappProvider } from './providers/whatsapp/whatsapp.provider';

describe('NotificationDispatcher.dispatchComms', () => {
    const prisma = {
        notificaciones: { create: jest.fn() },
        notificacionesEntregas: { create: jest.fn(), update: jest.fn() },
        catCanalesNotificaciones: { findUnique: jest.fn() },
        pushTokens: { findMany: jest.fn(), updateMany: jest.fn() },
    };
    const push = { enviar: jest.fn() };
    const mail = { send: jest.fn() };
    const whatsapp = { send: jest.fn() };
    const websocket = { send: jest.fn() };
    let dispatcher: NotificationDispatcher;

    beforeEach(async () => {
        jest.clearAllMocks();
        prisma.notificaciones.create.mockResolvedValue({ id: 'notif-1' });
        prisma.notificacionesEntregas.create.mockResolvedValue({ id: 'entrega-1' });
        prisma.notificacionesEntregas.update.mockResolvedValue({});
        prisma.catCanalesNotificaciones.findUnique.mockImplementation(async ({ where }: { where: { code?: string } }) => ({
            id: where.code === 'KIOSCO' ? 5 : 6,
            code: where.code,
        }));
        const module = await Test.createTestingModule({
            providers: [
                NotificationDispatcher,
                { provide: PrismaService, useValue: prisma },
                { provide: MailProvider, useValue: mail },
                { provide: WhatsappProvider, useValue: whatsapp },
                { provide: WebsocketProvider, useValue: websocket },
                { provide: PushProvider, useValue: push },
            ],
        }).compile();
        dispatcher = module.get(NotificationDispatcher);
    });

    it('crea la notificación y deja el kiosco pendiente sin enviar nada', async () => {
        const resultado = await dispatcher.dispatchComms(
            { userUuid: 'user-1' },
            {
                userUuid: 'user-1',
                titulo: 'Aviso',
                mensaje: 'Resumen',
                prioridad: 'NORMAL',
                origenTipo: 'COMUNICADO',
                origenId: '9',
                notificationTypeCode: 'COMUNICADO',
                idTenant: 3,
                idEmpresa: 10,
            },
            [{ codigo: 'KIOSCO', enviarAhora: false }],
        );
        expect(prisma.notificaciones.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    Categoria: null,
                    Prioridad: 'NORMAL',
                    OrigenTipo: 'COMUNICADO',
                    OrigenId: '9',
                }),
            }),
        );
        expect(resultado.entregas).toEqual([expect.objectContaining({ canal: 'KIOSCO', status: 'PENDIENTE' })]);
        expect(push.enviar).not.toHaveBeenCalled();
        expect(mail.send).not.toHaveBeenCalled();
        expect(whatsapp.send).not.toHaveBeenCalled();
    });

    it('conserva notify', () => {
        expect(typeof dispatcher.notify).toBe('function');
    });
});
