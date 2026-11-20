jest.mock('src/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('src/modules/notifications/gateways/websockets.gateway', () => ({ WebsocketGateway: class WebsocketGateway {} }));

import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CommsStorageService } from '../announcements/comms-storage.service';
import { CommsAckService } from './comms-ack.service';
import { MeCommsService } from './me-comms.service';
import { MemorySnoozeStore, SnoozeStore } from './snooze.store';

const usuario = {
    id: 7,
    uuid: '11111111-1111-4111-8111-111111111111',
    idTenant: 3,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'López',
} as ActiveUserDto;

const tipo = { idTipo: 2, Codigo: 'POLITICA', Nombre: 'Política', EsCorto: false };
const ahora = new Date('2026-11-14T18:00:00.000Z');

function comunicado(acuse = 'LEI_ENTENDI') {
    return {
        idComunicado: 9,
        idEmpresa: 10,
        idTenant: 3,
        Estado: 'ENVIADO',
        Prioridad: 'IMPORTANTE',
        AcuseModo: acuse,
        MostrarModal: true,
        PermitePregunta: true,
        RequiereIdentidad: false,
        CtaTipo: null,
        CtaTexto: null,
        CtaDestino: null,
        VigenteHasta: null,
        EnviadoEn: ahora,
        VersionActual: 1,
        ComTiposComunicado: tipo,
    };
}

describe('MeCommsService', () => {
    const prisma = {
        empleados: { findFirst: jest.fn() },
        comDestinatarios: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
        comComunicadoVersiones: { findMany: jest.fn(), findUnique: jest.fn() },
        comComunicadoAdjuntos: { findMany: jest.fn(), groupBy: jest.fn() },
        comPreguntas: { count: jest.fn(), create: jest.fn() },
        notificaciones: { findMany: jest.fn(), updateMany: jest.fn() },
        notificacionesEntregas: { updateMany: jest.fn() },
        catCanalesNotificaciones: { findUnique: jest.fn() },
        catSites: { findUnique: jest.fn() },
    };
    const ack = { confirmar: jest.fn() };
    const snooze = new MemorySnoozeStore();
    let service: MeCommsService;

    beforeEach(async () => {
        jest.clearAllMocks();
        prisma.empleados.findFirst.mockResolvedValue({ idEmpleado: 5, idUsuario: usuario.uuid, idSite: null });
        prisma.comDestinatarios.findMany.mockResolvedValue([]);
        prisma.comComunicadoVersiones.findMany.mockResolvedValue([]);
        prisma.comComunicadoVersiones.findUnique.mockResolvedValue({
            idVersion: 4,
            NumVersion: 1,
            Titulo: 'Política',
            Resumen: 'Léela',
            CuerpoHtml: '<p>Texto</p>',
            PortadaRuta: null,
        });
        prisma.comComunicadoAdjuntos.findMany.mockResolvedValue([]);
        prisma.comComunicadoAdjuntos.groupBy.mockResolvedValue([]);
        prisma.notificaciones.findMany.mockResolvedValue([{ id: 'n1' }]);
        prisma.catCanalesNotificaciones.findUnique.mockResolvedValue({ id: 8 });
        prisma.catSites.findUnique.mockResolvedValue({ zonaHoraria: 'America/Mexico_City' });
        ack.confirmar.mockResolvedValue({ confirmadoEn: ahora, version: 1, canal: 'WEB' });
        const module = await Test.createTestingModule({
            providers: [
                MeCommsService,
                { provide: PrismaService, useValue: prisma },
                { provide: CommsAckService, useValue: ack },
                { provide: CommsStorageService, useValue: { enlaceArchivo: jest.fn(() => ({ url: '/api/v2/public/comms/files/firma', ruta: 'public/comms/files/firma' })) } },
                { provide: SnoozeStore, useValue: snooze },
            ],
        }).compile();
        service = module.get(MeCommsService);
        service.ahora = () => ahora;
    });

    it('arma la bandeja de pendientes con el empleado de la sesión', async () => {
        await service.listar(usuario, 10, { tab: 'pendientes', search: 'política' });
        expect(prisma.empleados.findFirst).toHaveBeenCalledWith({
            where: { idUsuario: usuario.uuid, idEmpresa: 10, idTenant: 3, activo: true },
            select: { idEmpleado: true, idUsuario: true, idSite: true },
        });
        expect(prisma.comDestinatarios.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    idEmpleado: 5,
                    Estado: { notIn: ['CONFIRMADO', 'EXPIRADO'] },
                }),
            }),
        );
    });

    it('al abrir un comunicado de acuse al leer, marca la entrega y confirma', async () => {
        prisma.comDestinatarios.findFirst.mockResolvedValue({
            idDestinatario: 20,
            idComunicado: 9,
            Estado: 'ENTREGADO',
            LeidoEn: null,
            ConfirmadoEn: null,
            VersionConfirmada: null,
            ComComunicados: comunicado('LEIDO'),
        });
        const detalle = await service.detalle(usuario, 10, 9, { canal: 'APP', ip: null, userAgent: null, dispositivo: null });
        expect(prisma.comDestinatarios.update).toHaveBeenCalledWith({
            where: { idDestinatario: 20 },
            data: { LeidoEn: ahora, Estado: 'LEIDO' },
        });
        expect(ack.confirmar).toHaveBeenCalledWith(expect.objectContaining({ metodo: 'LECTURA', canal: 'APP', idEmpleado: 5 }));
        expect(prisma.notificaciones.updateMany).toHaveBeenCalled();
        expect(prisma.notificacionesEntregas.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: { status: 'LEIDO' } }),
        );
        expect(detalle.version.cuerpoTexto).toBe('Texto');
        expect(detalle.version.cuerpoHtml).toBe('<p>Texto</p>');
        expect(detalle.miEstado).toBe('CONFIRMADO');
    });

    it('el detalle trae la ruta relativa de la portada y del adjunto', async () => {
        prisma.comDestinatarios.findFirst.mockResolvedValue({
            idDestinatario: 20,
            idComunicado: 9,
            Estado: 'LEIDO',
            LeidoEn: ahora,
            ConfirmadoEn: null,
            VersionConfirmada: null,
            ComComunicados: comunicado('LEI_ENTENDI'),
        });
        prisma.comComunicadoVersiones.findUnique.mockResolvedValue({
            idVersion: 4,
            NumVersion: 1,
            Titulo: 'Política',
            Resumen: 'Léela',
            CuerpoHtml: '<p>Texto</p>',
            PortadaRuta: '3/10/comms/9/portada/foto.png',
        });
        prisma.comComunicadoAdjuntos.findMany.mockResolvedValue([
            { idAdjunto: 3, Nombre: 'Año.pdf', Ruta: '3/10/comms/9/adjuntos/a.pdf', Mime: 'application/pdf', TamanoBytes: 20 },
        ]);
        const detalle = await service.detalle(usuario, 10, 9, { canal: 'APP', ip: null, userAgent: null, dispositivo: null });
        expect(detalle.version.portadaRuta).toBe('public/comms/files/firma');
        expect(detalle.version.portadaUrl).toBe('/api/v2/public/comms/files/firma');
        expect(detalle.version.adjuntos[0]).toMatchObject({ nombre: 'Año.pdf', ruta: 'public/comms/files/firma' });
    });

    it('un acuse de leí y entendí no se crea solo con abrir', async () => {
        prisma.comDestinatarios.findFirst.mockResolvedValue({
            idDestinatario: 20,
            Estado: 'LEIDO',
            LeidoEn: ahora,
            ConfirmadoEn: null,
            VersionConfirmada: null,
            ComComunicados: comunicado('LEI_ENTENDI'),
        });
        await service.detalle(usuario, 10, 9, { canal: 'WEB', ip: null, userAgent: null, dispositivo: null });
        expect(ack.confirmar).not.toHaveBeenCalled();
    });

    it('rechaza la cuarta pregunta', async () => {
        prisma.comDestinatarios.findFirst.mockResolvedValue({
            idDestinatario: 20,
            ComComunicados: comunicado(),
        });
        prisma.comPreguntas.count.mockResolvedValue(3);
        await expect(service.preguntar(usuario, 10, 9, '¿Dónde firmo?')).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
        expect(prisma.comPreguntas.create).not.toHaveBeenCalled();
    });

    it('el modal dice si pide identidad y cuántos adjuntos tiene', async () => {
        prisma.comDestinatarios.findMany.mockResolvedValue([
            {
                idComunicado: 9,
                LeidoEn: null,
                Estado: 'PENDIENTE',
                ComComunicados: { ...comunicado(), RequiereIdentidad: true },
            },
        ]);
        prisma.comComunicadoVersiones.findMany.mockResolvedValue([
            { idVersion: 4, idComunicado: 9, NumVersion: 1, Titulo: 'Política', Resumen: 'Léela' },
        ]);
        prisma.comComunicadoAdjuntos.groupBy.mockResolvedValue([{ idVersion: 4, _count: { _all: 2 } }]);

        await expect(service.modalPendiente(usuario, 10)).resolves.toEqual([
            expect.objectContaining({
                id: 9,
                titulo: 'Política',
                resumen: 'Léela',
                requiereIdentidad: true,
                totalAdjuntos: 2,
            }),
        ]);
    });

    it('el snooze esconde el modal el resto del día', async () => {
        prisma.comDestinatarios.findFirst.mockResolvedValue({
            idDestinatario: 20,
            ComComunicados: comunicado(),
        });
        await service.posponer(usuario, 10, 9);
        prisma.comDestinatarios.findMany.mockResolvedValue([
            {
                idComunicado: 9,
                LeidoEn: null,
                Estado: 'PENDIENTE',
                ComComunicados: comunicado(),
            },
        ]);
        await expect(service.modalPendiente(usuario, 10)).resolves.toEqual([]);
    });

    it('con Redis caído, recordarme más tarde responde que la cola no está disponible', async () => {
        prisma.comDestinatarios.findFirst.mockResolvedValue({
            idDestinatario: 20,
            ComComunicados: comunicado(),
        });
        jest.spyOn(snooze, 'ocultar').mockRejectedValueOnce(new Error('ECONNREFUSED'));

        await expect(service.posponer(usuario, 10, 9)).rejects.toMatchObject({
            status: HttpStatus.SERVICE_UNAVAILABLE,
            response: { code: 'COLA_NO_DISPONIBLE' },
        });
    });
});
