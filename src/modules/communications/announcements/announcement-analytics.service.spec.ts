jest.mock('src/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('src/modules/notifications/notification.dispatcher', () => ({ NotificationDispatcher: class NotificationDispatcher {} }));
jest.mock('../delivery/announcement-dispatch.service', () => ({ AnnouncementDispatchService: class AnnouncementDispatchService {} }));

import { HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ExcelExportService } from 'src/common/services/excel-export.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { errorComms } from '../comms-http';
import { CommsCapabilityService } from '../capabilities/comms-capability.service';
import { AudienceResolverService } from '../audiences/audience-resolver.service';
import { AnnouncementDispatchService } from '../delivery/announcement-dispatch.service';
import { AnnouncementAnalyticsService } from './announcement-analytics.service';

const autor = {
    id: 7,
    uuid: '11111111-1111-4111-8111-111111111111',
    idTenant: 3,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'López',
} as ActiveUserDto;

function comunicado(extra: Record<string, unknown> = {}) {
    return {
        idComunicado: 9,
        idTenant: 3,
        idEmpresa: 10,
        Estado: 'ENVIADO',
        CreadoPor: autor.uuid,
        EnviadoEn: new Date('2026-11-01T00:00:00.000Z'),
        ...extra,
    };
}

function textoSql(query: unknown): string {
    if (query && typeof query === 'object' && 'strings' in query && Array.isArray((query as { strings: unknown }).strings)) {
        return (query as { strings: string[] }).strings.join(' ');
    }
    return '';
}

describe('AnnouncementAnalyticsService', () => {
    const tx = {
        comPreguntas: { findFirst: jest.fn(), update: jest.fn() },
        historicoMovimientos: { create: jest.fn() },
    };
    const prisma = {
        $queryRaw: jest.fn(),
        $transaction: jest.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
        comComunicados: { findFirst: jest.fn() },
        comDestinatarios: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
        comPreguntas: { findMany: jest.fn() },
        historicoMovimientos: { create: jest.fn() },
        catSites: { findMany: jest.fn() },
        catAreas: { findMany: jest.fn() },
        catPuestos: { findMany: jest.fn() },
        catTiposPersonal: { findMany: jest.fn() },
        empleados: { findMany: jest.fn() },
    };
    const capabilities = { contexto: jest.fn() };
    const resolver = { resolve: jest.fn() };
    const envio = { reencolarPendientes: jest.fn() };
    const excel = { generate: jest.fn() };
    const dispatcher = { dispatchComms: jest.fn() };
    let service: AnnouncementAnalyticsService;

    beforeEach(async () => {
        jest.clearAllMocks();
        capabilities.contexto.mockRejectedValue(errorComms(HttpStatus.FORBIDDEN, 'SIN_CAPACIDAD', 'No tienes permiso para esta acción.'));
        prisma.comComunicados.findFirst.mockResolvedValue(comunicado());
        prisma.$queryRaw.mockImplementation(async (query: unknown) => {
            const sql = textoSql(query);
            if (sql.includes('Notificaciones')) throw new Error('La analítica no se calcula sobre Notificaciones.');
            if (sql.includes('JSON_TABLE')) return [{ canal: 'APP', destinatarios: 4, entregados: 3, leidos: 2 }];
            if (sql.includes('ComAcuses')) return [{ corte: 0, total: 1 }];
            if (sql.includes('TIMESTAMPDIFF')) return [{ corte: 0, total: 2 }];
            if (sql.includes('AS id')) return [{ id: 4, estado: 'CONFIRMADO', total: 2 }, { id: 4, estado: 'PENDIENTE', total: 2 }];
            return [
                { estado: 'PENDIENTE', total: 3 },
                { estado: 'ENTREGADO', total: 2 },
                { estado: 'LEIDO', total: 2 },
                { estado: 'CONFIRMADO', total: 1 },
                { estado: 'FALLIDO', total: 1 },
                { estado: 'SIN_CANAL', total: 1 },
            ];
        });
        prisma.catSites.findMany.mockResolvedValue([{ idSite: 4, Descripcion: 'Norte' }]);
        envio.reencolarPendientes.mockResolvedValue({ reenviados: 2, sinCanal: 0 });
        excel.generate.mockResolvedValue(Buffer.from('xlsx'));
        dispatcher.dispatchComms.mockResolvedValue({ notificationId: 'n1', entregas: [] });
        const module = await Test.createTestingModule({
            providers: [
                AnnouncementAnalyticsService,
                { provide: PrismaService, useValue: prisma },
                { provide: CommsCapabilityService, useValue: capabilities },
                { provide: AudienceResolverService, useValue: resolver },
                { provide: AnnouncementDispatchService, useValue: envio },
                { provide: ExcelExportService, useValue: excel },
                { provide: NotificationDispatcher, useValue: dispatcher },
            ],
        }).compile();
        service = module.get(AnnouncementAnalyticsService);
    });

    it('arma los KPIs desde ComDestinatarios para el autor', async () => {
        const resultado = await service.analitica(autor, 10, 9);
        expect(capabilities.contexto).not.toHaveBeenCalled();
        expect(resultado).toMatchObject({
            destinatarios: 10,
            entregados: 5,
            leidos: 3,
            acuses: 1,
            pendientes: 5,
            porCanal: [{ canal: 'APP', destinatarios: 4, entregados: 3, porcentajeLectura: 50 }],
        });
        expect(resultado.curva[0]).toMatchObject({ hora: 6, lecturas: 2, acuses: 1 });
        expect(resultado.curva).toHaveLength(12);
    });

    it('niega la analítica a quien no es autor ni tiene la capacidad', async () => {
        prisma.comComunicados.findFirst.mockResolvedValue(comunicado({ CreadoPor: 'otro-autor' }));
        await expect(service.analitica(autor, 10, 9)).rejects.toMatchObject({
            status: HttpStatus.FORBIDDEN,
            response: { code: 'SIN_CAPACIDAD' },
        });
    });

    it('deja ver el comunicado a quien tiene la analítica de toda la empresa', async () => {
        prisma.comComunicados.findFirst.mockResolvedValue(comunicado({ CreadoPor: 'otro-autor' }));
        capabilities.contexto.mockResolvedValue({
            idTenant: 3,
            companyId: 10,
            idEmpleado: 1,
            alcance: 'TENANT',
            referencias: null,
            sitesUsuario: [],
            unidadPorSite: new Map(),
        });
        await expect(service.analitica(autor, 10, 9)).resolves.toMatchObject({ destinatarios: 10 });
        expect(resolver.resolve).not.toHaveBeenCalled();
    });

    it('desglosa por la ubicación congelada', async () => {
        const resultado = await service.desglose(autor, 10, 9, { by: 'site' });
        expect(resultado.grupos[0]).toMatchObject({ id: 4, nombre: 'Norte', destinatarios: 4, porcentajeLectura: 50, porcentajeAcuse: 50, pendientes: 2 });
    });

    it('lista destinatarios con el estado y la ubicación del snapshot', async () => {
        prisma.comDestinatarios.count.mockResolvedValue(1);
        prisma.comDestinatarios.findMany.mockResolvedValue([
            {
                idDestinatario: 3,
                idEmpleado: 20,
                idSite: 4,
                Estado: 'PENDIENTE',
                CanalesEfectivos: ['APP', 'WEB'],
                UltimoIntentoEn: new Date('2026-11-02T00:00:00.000Z'),
                Empleados: { nombre: 'Ana', primerApellido: 'López', segundoApellido: null },
            },
        ]);
        const pagina = await service.destinatarios(autor, 10, 9, { estado: 'PENDIENTE', site: 4, search: 'Ana', page: 1 });
        expect(prisma.comDestinatarios.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ idComunicado: 9, Estado: 'PENDIENTE', idSite: 4 }),
            }),
        );
        expect(pagina.items[0]).toMatchObject({ colaborador: 'Ana López', ubicacion: 'Norte', canales: ['APP', 'WEB'], estado: 'PENDIENTE' });
    });

    it('pide al Excel las columnas de la evidencia', async () => {
        prisma.comDestinatarios.findMany.mockResolvedValue([
            {
                idSite: 4,
                Estado: 'CONFIRMADO',
                Empleados: { nombre: 'Ana', primerApellido: 'López', segundoApellido: null },
                ComAcuses: [
                    {
                        FechaUtc: new Date('2026-11-14T18:30:00.000Z'),
                        ZonaHoraria: 'America/Mexico_City',
                        Canal: 'APP',
                        Metodo: 'SESION',
                        Ip: '10.0.0.8',
                        Dispositivo: 'Pixel',
                        ComComunicadoVersiones: { NumVersion: 2 },
                    },
                ],
            },
        ]);
        await service.exportar(autor, 10, 9);
        expect(excel.generate).toHaveBeenCalledWith(
            expect.objectContaining({
                columns: expect.arrayContaining([
                    expect.objectContaining({ header: 'Fecha y hora local' }),
                    expect.objectContaining({ header: 'Canal' }),
                    expect.objectContaining({ header: 'Método' }),
                    expect.objectContaining({ header: 'IP' }),
                    expect.objectContaining({ header: 'Dispositivo' }),
                    expect.objectContaining({ header: 'Versión' }),
                ]),
                rows: [expect.objectContaining({ fechaHoraLocal: '14/11/2026 12:30:00', canal: 'APP', metodo: 'SESION', ip: '10.0.0.8', version: 2 })],
            }),
        );
    });

    it('reenvía solo a los pendientes', async () => {
        prisma.comDestinatarios.findMany.mockResolvedValue([{ idDestinatario: 1 }, { idDestinatario: 2 }]);
        const resultado = await service.reenviar(autor, 10, 9, { alcance: 'PENDIENTES' });
        expect(prisma.comDestinatarios.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { idComunicado: 9, Estado: 'PENDIENTE' } }),
        );
        expect(envio.reencolarPendientes).toHaveBeenCalledWith(9, [1, 2]);
        expect(resultado).toMatchObject({ reenviados: 2, alcance: 'PENDIENTES' });
    });

    it('reenvía la ubicación congelada y no toca a quien ya leyó', async () => {
        prisma.comDestinatarios.findMany.mockResolvedValue([{ idDestinatario: 8 }]);
        await service.reenviar(autor, 10, 9, { alcance: 'SITE', idSite: 4 });
        const where = prisma.comDestinatarios.findMany.mock.calls[0][0].where;
        expect(where).toEqual({ idComunicado: 9, Estado: 'PENDIENTE', idSite: 4 });
        expect(where.Estado).not.toBe('LEIDO');
        expect(where.Estado).not.toBe('CONFIRMADO');
    });

    it('no reenvía un borrador', async () => {
        prisma.comComunicados.findFirst.mockResolvedValue(comunicado({ Estado: 'BORRADOR' }));
        await expect(service.reenviar(autor, 10, 9, { alcance: 'PENDIENTES' })).rejects.toBeInstanceOf(HttpException);
        expect(envio.reencolarPendientes).not.toHaveBeenCalled();
    });

    it('avisa la respuesta con categoría COMUNICADO y el enlace al comunicado', async () => {
        tx.comPreguntas.findFirst.mockResolvedValue({ idPregunta: 5, idEmpleado: 20, Respuesta: null });
        prisma.comDestinatarios.findUnique.mockResolvedValue({ idUsuario: '33333333-3333-4333-8333-333333333333' });
        const resultado = await service.responder(autor, 10, 9, 5, { respuesta: 'Firma en recepción.' });
        expect(resultado.notificado).toBe(true);
        expect(dispatcher.dispatchComms).toHaveBeenCalledWith(
            { userUuid: '33333333-3333-4333-8333-333333333333' },
            expect.objectContaining({
                categoria: 'COMUNICADO',
                deepLink: '/companies/10/comms/announcements/9',
                destino: { tipo: 'MI_COMUNICADO', id: 9 },
                notificationTypeCode: 'COMUNICADO',
            }),
            expect.arrayContaining([expect.objectContaining({ codigo: 'PUSH' }), expect.objectContaining({ codigo: 'SOCKETS' })]),
        );
    });

    it('no vuelve a responder una pregunta cerrada', async () => {
        tx.comPreguntas.findFirst.mockResolvedValue({ idPregunta: 5, idEmpleado: 20, Respuesta: 'Ya contesté' });
        await expect(service.responder(autor, 10, 9, 5, { respuesta: 'Otra' })).rejects.toMatchObject({
            status: HttpStatus.CONFLICT,
            response: { code: 'ESTADO_INVALIDO' },
        });
        expect(dispatcher.dispatchComms).not.toHaveBeenCalled();
    });
});
