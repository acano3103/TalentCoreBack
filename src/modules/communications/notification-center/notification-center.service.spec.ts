jest.mock('src/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('src/modules/notifications/campana-realtime.service', () => ({ CampanaRealtimeService: class CampanaRealtimeService {} }));

import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CampanaRealtimeService } from 'src/modules/notifications/campana-realtime.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationCenterService } from './notification-center.service';

const usuario = {
    id: 7,
    uuid: '11111111-1111-4111-8111-111111111111',
    idTenant: 3,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'López',
} as ActiveUserDto;

const ahora = new Date('2026-11-14T18:00:00.000Z');

describe('NotificationCenterService', () => {
    const prisma = {
        empleados: { findFirst: jest.fn() },
        catSites: { findUnique: jest.fn() },
        notificaciones: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
        catCanalesNotificaciones: { findMany: jest.fn() },
        preferenciasNotificacionesUsuario: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
        pushTokens: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn(), findMany: jest.fn() },
        $transaction: jest.fn(),
    };
    const campana = { conteo: jest.fn(), publicar: jest.fn() };
    let service: NotificationCenterService;

    beforeEach(async () => {
        jest.clearAllMocks();
        prisma.empleados.findFirst.mockResolvedValue({ idEmpleado: 5, idSite: null });
        prisma.catSites.findUnique.mockResolvedValue({ zonaHoraria: 'America/Mexico_City' });
        prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
        prisma.catCanalesNotificaciones.findMany.mockResolvedValue([
            { id: 1, code: 'PUSH' },
            { id: 2, code: 'EMAIL' },
            { id: 3, code: 'WHATSAPP' },
        ]);
        const module = await Test.createTestingModule({
            providers: [
                NotificationCenterService,
                { provide: PrismaService, useValue: prisma },
                { provide: CampanaRealtimeService, useValue: campana },
            ],
        }).compile();
        service = module.get(NotificationCenterService);
        service.ahora = () => ahora;
    });

    it('agrupa tres recordatorios de capacitación en Hoy', async () => {
        prisma.notificaciones.findMany.mockResolvedValue([
            fila('a', '2026-11-14T16:00:00.000Z'),
            fila('b', '2026-11-14T15:00:00.000Z'),
            fila('c', '2026-11-14T14:00:00.000Z'),
        ]);
        const pagina = await service.listar(usuario, 10, { tab: 'unread' });
        expect(pagina.grupos[0].nombre).toBe('Hoy');
        expect(pagina.grupos[0].items[0]).toEqual(
            expect.objectContaining({ cantidad: 3, titulo: '3 recordatorios de capacitación', ids: ['a', 'b', 'c'] }),
        );
        expect(prisma.notificaciones.update).not.toHaveBeenCalled();
    });

    it('marca leída sin borrar la fila', async () => {
        prisma.notificaciones.findFirst.mockResolvedValue({ id: 'a', read_at: null });
        prisma.notificaciones.update.mockResolvedValue({});
        await expect(service.marcarLeida(usuario, 10, 'a')).resolves.toEqual({
            id: 'a',
            leida: true,
            leidaEn: ahora,
        });
        expect(prisma.notificaciones.update).toHaveBeenCalledWith({
            where: { id: 'a' },
            data: { read_at: ahora },
        });
        expect(prisma.notificaciones).not.toHaveProperty('delete');
    });

    it('rechaza apagar una preferencia bloqueada', async () => {
        await expect(
            service.guardarPreferencias(usuario, {
                preferencias: [{ categoria: 'APROBACION', canal: 'PUSH', activa: false }],
            }),
        ).rejects.toMatchObject({
            response: { code: 'PREFERENCIA_BLOQUEADA', detail: { categoria: 'APROBACION', canal: 'PUSH' } },
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
        await expect(
            service.guardarPreferencias(usuario, {
                preferencias: [{ categoria: 'APROBACION', canal: 'PUSH', activa: false }],
            }),
        ).rejects.toBeInstanceOf(HttpException);
    });

    it('guarda la celda por id y nunca deja la categoría vacía', async () => {
        prisma.preferenciasNotificacionesUsuario.findFirst.mockResolvedValue(null);
        prisma.preferenciasNotificacionesUsuario.findMany.mockResolvedValue([]);
        prisma.preferenciasNotificacionesUsuario.create.mockResolvedValue({});
        await service.guardarPreferencias(usuario, {
            preferencias: [{ categoria: 'COMUNICADO', canal: 'PUSH', activa: false }],
        });
        expect(prisma.preferenciasNotificacionesUsuario.findFirst).toHaveBeenCalledWith({
            where: { user_uuid: usuario.uuid, channel_id: 1, categoria: 'COMUNICADO' },
            orderBy: { id: 'asc' },
        });
        expect(prisma.preferenciasNotificacionesUsuario.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                user_uuid: usuario.uuid,
                channel_id: 1,
                categoria: 'COMUNICADO',
                enabled: false,
            }),
        });
        expect(prisma.preferenciasNotificacionesUsuario.create.mock.calls[0][0].data.categoria).not.toBeNull();
    });

    it('actualiza la fila de esa categoría sin upsert', async () => {
        prisma.preferenciasNotificacionesUsuario.findFirst.mockResolvedValue({ id: 4, categoria: 'COMUNICADO' });
        prisma.preferenciasNotificacionesUsuario.findMany.mockResolvedValue([]);
        prisma.preferenciasNotificacionesUsuario.update.mockResolvedValue({});
        await service.guardarPreferencias(usuario, {
            preferencias: [{ categoria: 'COMUNICADO', canal: 'PUSH', activa: true }],
        });
        expect(prisma.preferenciasNotificacionesUsuario.update).toHaveBeenCalledWith({
            where: { id: 4 },
            data: { enabled: true, updated_at: ahora },
        });
        expect(prisma.preferenciasNotificacionesUsuario.create).not.toHaveBeenCalled();
    });

    it('reasigna el token si cambió de usuario', async () => {
        prisma.pushTokens.findUnique.mockResolvedValue({
            idPushToken: 9,
            Token: 'ExponentPushToken[abc]',
            user_uuid: 'otro-usuario',
            Plataforma: 'ios',
            Dispositivo: 'viejo',
            Activo: true,
            UltimoUso: null,
        });
        prisma.pushTokens.update.mockResolvedValue({
            idPushToken: 9,
            Token: 'ExponentPushToken[abc]',
            Plataforma: 'android',
            Dispositivo: 'Pixel',
            Activo: true,
            UltimoUso: ahora,
        });
        const dispositivo = await service.registrarToken(usuario, 10, {
            token: 'ExponentPushToken[abc]',
            plataforma: 'android',
            dispositivo: 'Pixel',
        });
        expect(prisma.pushTokens.update).toHaveBeenCalledWith({
            where: { idPushToken: 9 },
            data: expect.objectContaining({
                user_uuid: usuario.uuid,
                idEmpleado: 5,
                Plataforma: 'android',
                Dispositivo: 'Pixel',
                Activo: true,
                FechaBaja: null,
            }),
        });
        expect(dispositivo).toEqual(expect.objectContaining({ id: 9, token: 'ExponentPushToken[abc]', plataforma: 'android' }));
        expect(prisma.pushTokens.create).not.toHaveBeenCalled();
    });
});

function fila(id: string, creado: string) {
    return {
        id,
        title: 'Recordatorio de capacitación',
        message: 'Te falta un curso',
        Categoria: 'RECORDATORIO',
        Prioridad: 'NORMAL',
        DeepLink: null,
        OrigenTipo: 'RECORDATORIO',
        OrigenId: 'curso-1',
        ClaveAgrupacion: 'cap',
        created_at: new Date(creado),
        read_at: null,
        CatTipoNotificacion: { code: 'RECORDATORIO' },
    };
}
