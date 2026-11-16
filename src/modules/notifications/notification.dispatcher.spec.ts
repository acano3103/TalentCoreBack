jest.mock('src/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('./providers/mail/mail.provider', () => ({ MailProvider: class MailProvider {} }));
jest.mock('./providers/whatsapp/whatsapp.provider', () => ({ WhatsappProvider: class WhatsappProvider {} }));
jest.mock('./providers/websocket/websocket.provider', () => ({ WebsocketProvider: class WebsocketProvider {} }));
jest.mock('./providers/push/push.provider', () => ({ PushProvider: class PushProvider {} }));
jest.mock('./campana-realtime.service', () => ({ CampanaRealtimeService: class CampanaRealtimeService {} }));

import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { CampanaRealtimeService } from './campana-realtime.service';
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
        preferenciasNotificacionesUsuario: { findFirst: jest.fn() },
    };
    const campana = { publicar: jest.fn() };
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
        prisma.preferenciasNotificacionesUsuario.findFirst.mockResolvedValue(null);
        campana.publicar.mockResolvedValue(undefined);
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
                { provide: CampanaRealtimeService, useValue: campana },
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

    it('no manda push si la persona apagó la categoría y avisa a la campana', async () => {
        prisma.preferenciasNotificacionesUsuario.findFirst.mockResolvedValue({ enabled: false });
        await dispatcher.dispatchComms(
            { userUuid: 'user-1' },
            payload('COMUNICADO'),
            [{ codigo: 'PUSH', enviarAhora: true }],
        );
        expect(push.enviar).not.toHaveBeenCalled();
        expect(prisma.notificacionesEntregas.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: 'OMITIDO' }) }),
        );
        expect(campana.publicar).toHaveBeenCalledWith(
            'user-1',
            10,
            3,
            expect.objectContaining({ id: 'notif-1' }),
        );
    });

    it('manda el push de una aprobación aunque la preferencia esté apagada', async () => {
        prisma.preferenciasNotificacionesUsuario.findFirst.mockResolvedValue({ enabled: false });
        prisma.pushTokens.findMany.mockResolvedValue([{ Token: 'ExponentPushToken[abc]' }]);
        push.enviar.mockResolvedValue([{ token: 'ExponentPushToken[abc]', ticketId: 'ticket-1' }]);
        await dispatcher.dispatchComms(
            { userUuid: 'user-1' },
            payload('APROBACION'),
            [{ codigo: 'PUSH', enviarAhora: true }],
        );
        expect(prisma.preferenciasNotificacionesUsuario.findFirst).not.toHaveBeenCalled();
        expect(push.enviar).toHaveBeenCalled();
    });

    it('guarda el destino y lo manda en el push aunque la preferencia esté apagada', async () => {
        prisma.preferenciasNotificacionesUsuario.findFirst.mockResolvedValue({ enabled: false });
        prisma.pushTokens.findMany.mockResolvedValue([{ Token: 'ExponentPushToken[abc]' }]);
        push.enviar.mockResolvedValue([{ token: 'ExponentPushToken[abc]', ticketId: 'ticket-1' }]);
        await dispatcher.dispatchComms(
            { userUuid: 'user-1' },
            {
                ...payload('COMUNICADO'),
                prioridad: 'IMPORTANTE',
                requiereAcuse: true,
                destino: { tipo: 'MI_COMUNICADO', id: 9 },
            },
            [{ codigo: 'PUSH', enviarAhora: true }],
        );
        expect(prisma.notificaciones.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                DeepLink: null,
                Destino: { tipo: 'MI_COMUNICADO', id: 9 },
            }),
        }));
        expect(push.enviar).toHaveBeenCalledWith([
            expect.objectContaining({
                data: { destino: JSON.stringify({ tipo: 'MI_COMUNICADO', id: 9 }) },
            }),
        ]);
        expect(campana.publicar).toHaveBeenCalledWith(
            'user-1',
            10,
            3,
            expect.objectContaining({ destino: { tipo: 'MI_COMUNICADO', id: 9 } }),
        );
    });
});

function payload(codigo: 'COMUNICADO' | 'APROBACION') {
    return {
        userUuid: 'user-1',
        titulo: 'Aviso',
        mensaje: 'Resumen',
        categoria: codigo,
        prioridad: 'NORMAL' as const,
        origenTipo: codigo,
        origenId: '9',
        notificationTypeCode: codigo,
        idTenant: 3,
        idEmpresa: 10,
        push: { title: 'Aviso', body: 'Resumen' },
    };
}
