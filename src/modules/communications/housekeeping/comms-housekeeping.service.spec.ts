import { CommsHousekeepingService } from './comms-housekeeping.service';

describe('CommsHousekeepingService', () => {
    const ahora = new Date('2026-11-14T08:00:00.000Z');

    function armar() {
        const prisma = {
            comComunicados: {
                updateMany: jest.fn().mockResolvedValue({ count: 2 }),
                deleteMany: jest.fn(),
            },
            comDestinatarios: {
                updateMany: jest.fn().mockResolvedValue({ count: 5 }),
                deleteMany: jest.fn(),
            },
            comComunicadoVersiones: { deleteMany: jest.fn() },
            comAcuses: { deleteMany: jest.fn() },
            notificaciones: {
                findMany: jest.fn().mockResolvedValue([{ id: 'notif-1' }]),
                deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            notificacionesEntregas: {
                deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
            },
        };
        const service = new CommsHousekeepingService(prisma as never);
        service.ahora = () => ahora;
        return { service, prisma };
    }

    it('expira comunicados y destinatarios sin acuse, y purga avisos viejos', async () => {
        const { service, prisma } = armar();
        const resultado = await service.ejecutar();

        expect(resultado).toEqual({ comunicados: 2, destinatarios: 5, notificaciones: 1, entregas: 6 });
        expect(prisma.comComunicados.updateMany).toHaveBeenCalledWith({
            where: { Estado: { in: ['ENVIADO', 'ENVIANDO'] }, VigenteHasta: { lte: ahora } },
            data: { Estado: 'EXPIRADO' },
        });
        expect(prisma.comDestinatarios.updateMany).toHaveBeenCalledWith({
            where: {
                Estado: { in: ['PENDIENTE', 'ENTREGADO', 'LEIDO', 'FALLIDO', 'SIN_CANAL'] },
                ComAcuses: { none: {} },
                ComComunicados: { Estado: 'EXPIRADO', VigenteHasta: { lte: ahora } },
            },
            data: { Estado: 'EXPIRADO' },
        });
        expect(prisma.notificaciones.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['notif-1'] } } });
        expect(prisma.notificacionesEntregas.deleteMany).toHaveBeenCalledWith({
            where: { notification_id: { in: ['notif-1'] } },
        });
        expect(prisma.notificacionesEntregas.deleteMany).toHaveBeenCalledWith({
            where: { sent_at: { lt: new Date('2025-11-14T08:00:00.000Z') } },
        });
        expect(prisma.comAcuses.deleteMany).not.toHaveBeenCalled();
        expect(prisma.comComunicados.deleteMany).not.toHaveBeenCalled();
        expect(prisma.comDestinatarios.deleteMany).not.toHaveBeenCalled();
        expect(prisma.comComunicadoVersiones.deleteMany).not.toHaveBeenCalled();
    });

    it('cada minuto reencola los envíos atascados', async () => {
        const prisma = {
            comComunicados: { updateMany: jest.fn(), deleteMany: jest.fn() },
            comDestinatarios: { updateMany: jest.fn(), deleteMany: jest.fn() },
            comComunicadoVersiones: { deleteMany: jest.fn() },
            comAcuses: { deleteMany: jest.fn() },
            notificaciones: { findMany: jest.fn(), deleteMany: jest.fn() },
            notificacionesEntregas: { deleteMany: jest.fn() },
        };
        const dispatch = { reencolarEnviosAtorados: jest.fn().mockResolvedValue(1) };
        const service = new CommsHousekeepingService(prisma as never, dispatch as never);
        service.ahora = () => ahora;
        await service.reencolarEnvios();
        expect(dispatch.reencolarEnviosAtorados).toHaveBeenCalledWith(ahora);
    });

    it('sigue con la purga si expirar comunicados falla', async () => {
        const { service, prisma } = armar();
        prisma.comComunicados.updateMany.mockRejectedValue(new Error('caído'));
        const resultado = await service.ejecutar();
        expect(resultado.comunicados).toBe(0);
        expect(resultado.destinatarios).toBe(5);
        expect(resultado.notificaciones).toBe(1);
    });
});
