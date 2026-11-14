jest.mock('src/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('src/modules/notifications/notification.dispatcher', () => ({ NotificationDispatcher: class NotificationDispatcher {} }));
jest.mock('src/modules/notifications/gateways/websockets.gateway', () => ({ WebsocketGateway: class WebsocketGateway {} }));

import { getQueueToken } from '@nestjs/bull';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { NotificationDispatcher } from 'src/modules/notifications/notification.dispatcher';
import { WebsocketGateway } from 'src/modules/notifications/gateways/websockets.gateway';
import { CommsCapabilityService } from '../capabilities/comms-capability.service';
import { AudienceResolverService } from '../audiences/audience-resolver.service';
import { EffectiveChannelService } from '../channels/effective-channel.service';
import { AnnouncementDispatchService } from './announcement-dispatch.service';
import { COLA_ENVIO, COLA_ESCALAMIENTO } from './colas';

const usuario = {
    id: 7,
    uuid: '11111111-1111-4111-8111-111111111111',
    idTenant: 3,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'López',
} as ActiveUserDto;

const tipo = { Codigo: 'POLITICA', EsCorto: false };
const version = { Titulo: 'Política de asistencia', Resumen: 'Lee y confirma', CuerpoHtml: '<p>Texto</p>' };

function fila(estado: string, extra: Record<string, unknown> = {}) {
    return {
        idComunicado: 9,
        idTenant: 3,
        idEmpresa: 10,
        Estado: estado,
        Prioridad: 'NORMAL',
        CanalesForzados: null,
        Escalamiento: null,
        Categoria: null,
        idAudiencia: null,
        CriteriosAudiencia: { empresas: [10] },
        VigenteHasta: null,
        VersionActual: 1,
        TotalDestinatarios: 0,
        CreadoPor: usuario.uuid,
        ComTiposComunicado: tipo,
        ...extra,
    };
}

describe('AnnouncementDispatchService', () => {
    const colaEnvio = { add: jest.fn(), getJob: jest.fn() };
    const colaEscala = { add: jest.fn(), getJob: jest.fn() };
    const dispatcher = { dispatchComms: jest.fn(), completarPendientes: jest.fn(), omitirPendientes: jest.fn() };
    const gateway = { sendNotificationToUser: jest.fn() };
    const capabilities = { contexto: jest.fn(), getEffective: jest.fn() };
    const resolver = { resolve: jest.fn() };
    const canales = { forEmployees: jest.fn() };

    function prismaDe() {
        const prisma = {
            comComunicados: { findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn(), count: jest.fn() },
            comComunicadoVersiones: { findUnique: jest.fn() },
            comConfigEmpresa: { findUnique: jest.fn() },
            comDestinatarios: {
                createMany: jest.fn(),
                findMany: jest.fn(),
                findUnique: jest.fn(),
                count: jest.fn(),
                update: jest.fn(),
                updateMany: jest.fn(),
            },
            comEnlacesSeguros: { create: jest.fn() },
            empleados: { findMany: jest.fn() },
            catSites: { findMany: jest.fn() },
            catEmpresas: { findUnique: jest.fn() },
            horariosEmpleado: { findMany: jest.fn() },
            historicoMovimientos: { create: jest.fn() },
            waPrecios: { findMany: jest.fn() },
            waConsumo: { create: jest.fn(), aggregate: jest.fn() },
            waTopes: { findMany: jest.fn() },
            auth_user: { findUnique: jest.fn() },
            $transaction: jest.fn(),
        };
        prisma.$transaction.mockImplementation(async (fn: unknown) => (typeof fn === 'function' ? fn(prisma) : fn));
        return prisma;
    }

    async function servicio(prisma: ReturnType<typeof prismaDe>) {
        const module = await Test.createTestingModule({
            providers: [
                AnnouncementDispatchService,
                { provide: PrismaService, useValue: prisma },
                { provide: CommsCapabilityService, useValue: capabilities },
                { provide: AudienceResolverService, useValue: resolver },
                { provide: EffectiveChannelService, useValue: canales },
                { provide: NotificationDispatcher, useValue: dispatcher },
                { provide: WebsocketGateway, useValue: gateway },
                { provide: ConfigService, useValue: { get: jest.fn(() => 'https://app.ejemplo') } },
                { provide: getQueueToken(COLA_ENVIO), useValue: colaEnvio },
                { provide: getQueueToken(COLA_ESCALAMIENTO), useValue: colaEscala },
            ],
        }).compile();
        return module.get(AnnouncementDispatchService);
    }

    beforeEach(() => {
        jest.clearAllMocks();
        colaEnvio.getJob.mockResolvedValue(null);
        colaEnvio.add.mockResolvedValue(undefined);
        colaEscala.add.mockResolvedValue(undefined);
        capabilities.contexto.mockResolvedValue({
            idTenant: 3,
            companyId: 10,
            idEmpleado: 1,
            alcance: 'TENANT',
            referencias: null,
            sitesUsuario: [],
            unidadPorSite: new Map(),
        });
        capabilities.getEffective.mockResolvedValue([{ codigo: 'COM_CREAR', alcance: 'TENANT', referencias: null, tiposPermitidos: null }]);
        dispatcher.dispatchComms.mockImplementation(async (_destino: unknown, _payload: unknown, lista: { codigo: string; enviarAhora: boolean }[]) => ({
            notificationId: 'n1',
            entregas: lista.map((canal, indice) => ({
                id: `e-${indice}`,
                canal: canal.codigo,
                status: canal.enviarAhora || canal.codigo === 'KIOSCO' ? (canal.codigo === 'KIOSCO' ? 'PENDIENTE' : 'SENT') : 'PENDIENTE',
            })),
        }));
    });

    it('envía 2500 destinatarios en lotes y un segundo envío no duplica', async () => {
        const ids = Array.from({ length: 2500 }, (_, indice) => indice + 1);
        const prisma = prismaDe();
        let estado = 'BORRADOR';
        const tamanos: number[] = [];
        prisma.comComunicados.findFirst.mockImplementation(async () => fila(estado));
        prisma.comComunicados.updateMany.mockImplementation(async () => {
            if (estado === 'BORRADOR' || estado === 'PROGRAMADO') {
                estado = 'ENVIANDO';
                return { count: 1 };
            }
            return { count: 0 };
        });
        prisma.comComunicados.update.mockImplementation(async ({ data }: { data: { Estado?: string } }) => {
            if (data.Estado) estado = data.Estado;
            return {};
        });
        prisma.comComunicadoVersiones.findUnique.mockResolvedValue(version);
        prisma.comConfigEmpresa.findUnique.mockResolvedValue({
            PoliticaWhatsApp: 'IMPORTANTE_CRITICA',
            PlantillasWhatsApp: null,
            SilencioActivo: false,
            SilencioInicio: '21:00',
            SilencioFin: '07:00',
            EscalaImportanteMin: 240,
            EscalaCriticaMin: 120,
            EscalaCorreoMin: 240,
        });
        prisma.empleados.findMany.mockImplementation(async ({ where }: { where: { idEmpleado: { in: number[] } } }) =>
            where.idEmpleado.in.map((id) => ({
                idEmpleado: id,
                idUsuario: `user-${id}`,
                idSite: 1,
                idPuesto: 2,
                idTipoPersonalOverride: null,
                idJefeInmediato: 8,
                nombre: 'Ana',
                primerApellido: 'López',
                telefonoMovil: null,
                correo: null,
                CatPuestos: { idArea: 4, idTipoPersonal: 5 },
            })),
        );
        resolver.resolve.mockResolvedValue({ ids, fueraDeAlcance: [] });
        canales.forEmployees.mockImplementation(async (pedidos: number[]) => ({
            porEmpleado: pedidos.map((id) => ({ idEmpleado: id, canales: ['APP', 'WEB'], sinCanal: false, nivelPerfil: 'DEFAULT' })),
            resumen: { APP: pedidos.length, WHATSAPP: 0, CORREO: 0, KIOSCO: 0, SIN_CANAL: 0 },
        }));
        prisma.comDestinatarios.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => {
            tamanos.push(data.length);
            return { count: data.length };
        });
        prisma.comDestinatarios.count.mockResolvedValue(2500);
        prisma.comDestinatarios.findMany.mockImplementation(async ({ where }: { where: { idDestinatario?: { in: number[] } } }) => {
            if (where.idDestinatario?.in) {
                return where.idDestinatario.in.map((id) => ({
                    idDestinatario: id,
                    idComunicado: 9,
                    idEmpleado: id,
                    idUsuario: `user-${id}`,
                    idSite: 1,
                    CanalesEfectivos: ['APP', 'WEB'],
                    Estado: 'PENDIENTE',
                    UltimoIntentoEn: null,
                    LeidoEn: null,
                    EscaladoA: null,
                }));
            }
            return ids.map((id) => ({ idDestinatario: id }));
        });
        prisma.comDestinatarios.updateMany.mockResolvedValue({ count: 1 });
        prisma.comDestinatarios.update.mockResolvedValue({});
        prisma.catSites.findMany.mockResolvedValue([{ idSite: 1, zonaHoraria: 'America/Mexico_City' }]);
        prisma.catEmpresas.findUnique.mockResolvedValue({ nombre_comercial: 'Acme' });
        prisma.horariosEmpleado.findMany.mockResolvedValue([]);
        prisma.historicoMovimientos.create.mockResolvedValue({});

        const service = await servicio(prisma);
        const primero = await service.enviar(usuario, 10, 9);
        const lotes = colaEnvio.add.mock.calls.filter((llamada) => llamada[0] === 'lote');
        for (const llamada of lotes) {
            await service.procesarLote(9, llamada[1].ids);
        }
        const createMany = prisma.comDestinatarios.createMany.mock.calls.length;
        const envios = dispatcher.dispatchComms.mock.calls.length;

        expect(primero).toEqual({ id: 9, estado: 'ENVIADO', totalDestinatarios: 2500, idempotente: false });
        expect(tamanos).toEqual([1000, 1000, 500]);
        expect(lotes.map((llamada) => llamada[1].ids.length)).toEqual([500, 500, 500, 500, 500]);
        expect(envios).toBe(2500);
        expect(prisma.comComunicados.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ Estado: 'ENVIADO', TotalDestinatarios: 2500 }) }),
        );

        const segundo = await service.enviar(usuario, 10, 9);
        expect(segundo).toEqual(expect.objectContaining({ estado: 'ENVIADO', idempotente: true, totalDestinatarios: 0 }));
        expect(prisma.comDestinatarios.createMany).toHaveBeenCalledTimes(createMany);
        expect(dispatcher.dispatchComms).toHaveBeenCalledTimes(envios);
    }, 30_000);

    it('fuera de turno difiere el push y deja la app al momento; la crítica sale ya', async () => {
        const prisma = prismaDe();
        const ahora = new Date('2026-11-15T04:00:00.000Z');
        prisma.comComunicados.findFirst.mockResolvedValue(
            fila('ENVIADO', { Prioridad: 'NORMAL', TotalDestinatarios: 1, EnviadoEn: ahora }),
        );
        prisma.comComunicadoVersiones.findUnique.mockResolvedValue(version);
        prisma.comConfigEmpresa.findUnique.mockResolvedValue({
            PoliticaWhatsApp: 'NUNCA',
            PlantillasWhatsApp: null,
            SilencioActivo: true,
            SilencioInicio: '21:00',
            SilencioFin: '07:00',
            EscalaImportanteMin: 240,
            EscalaCriticaMin: 120,
            EscalaCorreoMin: 240,
        });
        prisma.comDestinatarios.findMany.mockResolvedValue([
            {
                idDestinatario: 4,
                idComunicado: 9,
                idEmpleado: 4,
                idUsuario: usuario.uuid,
                idSite: 1,
                CanalesEfectivos: ['APP', 'WEB'],
                Estado: 'PENDIENTE',
                UltimoIntentoEn: null,
            },
        ]);
        prisma.comDestinatarios.updateMany.mockResolvedValue({ count: 1 });
        prisma.comDestinatarios.update.mockResolvedValue({});
        prisma.comDestinatarios.count.mockResolvedValue(1);
        prisma.empleados.findMany.mockResolvedValue([
            { idEmpleado: 4, idUsuario: usuario.uuid, idSite: 1, nombre: 'Ana', primerApellido: 'López', telefonoMovil: null, correo: null },
        ]);
        prisma.horariosEmpleado.findMany.mockResolvedValue([
            { idEmpleado: 4, DiaSemana: 'Lunes', HoraEntrada: new Date('1970-01-01T08:00:00.000Z'), HoraSalida: new Date('1970-01-01T17:00:00.000Z') },
        ]);
        prisma.catSites.findMany.mockResolvedValue([{ idSite: 1, zonaHoraria: 'America/Mexico_City' }]);
        prisma.catEmpresas.findUnique.mockResolvedValue({ nombre_comercial: 'Acme' });

        const service = await servicio(prisma);
        jest.spyOn(service, 'ahora').mockReturnValue(ahora);
        await service.procesarLote(9, [4]);

        const canalesEnviados = dispatcher.dispatchComms.mock.calls[0][2] as { codigo: string; enviarAhora: boolean }[];
        expect(canalesEnviados).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ codigo: 'SOCKETS', enviarAhora: true }),
                expect.objectContaining({ codigo: 'PUSH', enviarAhora: false }),
            ]),
        );
        expect(colaEnvio.add).toHaveBeenCalledWith(
            'diferido',
            expect.objectContaining({ canales: ['PUSH'], idDestinatario: 4 }),
            expect.objectContaining({ delay: 122_400_000 }),
        );

        dispatcher.dispatchComms.mockClear();
        colaEnvio.add.mockClear();
        prisma.comComunicados.findFirst.mockResolvedValue(fila('ENVIADO', { Prioridad: 'CRITICA', TotalDestinatarios: 1 }));
        await service.procesarLote(9, [4]);
        const critica = dispatcher.dispatchComms.mock.calls[0][2] as { codigo: string; enviarAhora: boolean }[];
        expect(critica.find((canal) => canal.codigo === 'PUSH')?.enviarAhora).toBe(true);
        expect(colaEnvio.add).not.toHaveBeenCalled();
    });

    it('escala si nadie leyó y no escala si ya hay lectura', async () => {
        const prisma = prismaDe();
        const dest = {
            idDestinatario: 4,
            idComunicado: 9,
            idEmpleado: 4,
            idUsuario: usuario.uuid,
            CanalesEfectivos: ['APP', 'WEB'],
            Estado: 'ENTREGADO',
            LeidoEn: null as Date | null,
            EscaladoA: null,
        };
        prisma.comDestinatarios.findUnique.mockImplementation(async () => ({ ...dest }));
        prisma.comDestinatarios.update.mockResolvedValue({});
        prisma.comComunicados.findFirst.mockResolvedValue(
            fila('ENVIADO', { Prioridad: 'IMPORTANTE', TotalDestinatarios: 1 }),
        );
        prisma.comComunicadoVersiones.findUnique.mockResolvedValue(version);
        prisma.comConfigEmpresa.findUnique.mockResolvedValue({
            PlantillasWhatsApp: { POLITICA: 'plantilla-1' },
            EscalaImportanteMin: 240,
            EscalaCriticaMin: 120,
            EscalaCorreoMin: 90,
            SilencioActivo: false,
            SilencioInicio: '21:00',
            SilencioFin: '07:00',
            PoliticaWhatsApp: 'IMPORTANTE_CRITICA',
        });
        prisma.catEmpresas.findUnique.mockResolvedValue({ nombre_comercial: 'Acme' });
        prisma.empleados.findMany.mockResolvedValue([
            { idEmpleado: 4, idUsuario: usuario.uuid, idSite: 1, nombre: 'Ana', primerApellido: 'López', telefonoMovil: '5512345678', correo: 'ana@ejemplo.com' },
        ]);
        prisma.comEnlacesSeguros.create.mockResolvedValue({});
        prisma.waPrecios.findMany.mockResolvedValue([
            { idTenant: 3, PrecioBase: 0.8, PreciosCategoria: null, Moneda: 'MXN', VigenteDesde: new Date('2026-01-01T00:00:00.000Z') },
        ]);
        prisma.waConsumo.aggregate.mockResolvedValue({ _sum: { Costo: 0 } });
        prisma.waConsumo.create.mockResolvedValue({});
        prisma.waTopes.findMany.mockResolvedValue([]);

        const service = await servicio(prisma);
        await expect(service.escalar(4)).resolves.toBe('enviado');
        expect(dispatcher.dispatchComms).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            [expect.objectContaining({ codigo: 'WHATSAPP', enviarAhora: true })],
        );
        expect(prisma.waConsumo.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ PrecioUnitario: 0.8, Costo: 0.8, Plantilla: 'plantilla-1' }) }),
        );

        dispatcher.dispatchComms.mockClear();
        dest.LeidoEn = new Date('2026-11-14T12:00:00.000Z');
        await expect(service.escalar(4)).resolves.toBe('omitido');
        expect(dispatcher.dispatchComms).not.toHaveBeenCalled();
    });

    it('congela el precio vigente cuando la tarifa cambia a mitad de mes', async () => {
        const prisma = prismaDe();
        const precios = [
            { idTenant: null, PrecioBase: 0.4, PreciosCategoria: null, Moneda: 'MXN', VigenteDesde: new Date('2026-01-01T00:00:00.000Z') },
            { idTenant: 3, PrecioBase: 0.8, PreciosCategoria: null, Moneda: 'MXN', VigenteDesde: new Date('2026-01-01T00:00:00.000Z') },
            { idTenant: 3, PrecioBase: 1.2, PreciosCategoria: null, Moneda: 'MXN', VigenteDesde: new Date('2026-11-16T00:00:00.000Z') },
        ];
        prisma.waPrecios.findMany.mockResolvedValue(precios);
        prisma.waConsumo.aggregate.mockResolvedValue({ _sum: { Costo: 0 } });
        prisma.waConsumo.create.mockResolvedValue({});
        prisma.waTopes.findMany.mockResolvedValue([]);
        prisma.comEnlacesSeguros.create.mockResolvedValue({});
        prisma.comDestinatarios.update.mockResolvedValue({});
        prisma.comComunicadoVersiones.findUnique.mockResolvedValue(version);
        prisma.comConfigEmpresa.findUnique.mockResolvedValue({
            PlantillasWhatsApp: { POLITICA: 'plantilla-1' },
            EscalaImportanteMin: 240,
            EscalaCriticaMin: 120,
            EscalaCorreoMin: 240,
            SilencioActivo: false,
            SilencioInicio: '21:00',
            SilencioFin: '07:00',
            PoliticaWhatsApp: 'IMPORTANTE_CRITICA',
        });
        prisma.catEmpresas.findUnique.mockResolvedValue({ nombre_comercial: 'Acme' });
        prisma.comComunicados.findFirst.mockResolvedValue(fila('ENVIADO', { Prioridad: 'IMPORTANTE', TotalDestinatarios: 2 }));
        prisma.empleados.findMany.mockResolvedValue([
            { idEmpleado: 4, idUsuario: usuario.uuid, idSite: 1, nombre: 'Ana', primerApellido: 'López', telefonoMovil: '5512345678', correo: 'ana@ejemplo.com' },
        ]);
        prisma.comDestinatarios.findUnique.mockResolvedValue({
            idDestinatario: 4,
            idComunicado: 9,
            idEmpleado: 4,
            CanalesEfectivos: ['APP'],
            Estado: 'ENTREGADO',
            LeidoEn: null,
            EscaladoA: null,
        });

        const service = await servicio(prisma);
        jest.spyOn(service, 'ahora').mockReturnValue(new Date('2026-11-10T12:00:00.000Z'));
        await service.escalar(4);
        expect(prisma.waConsumo.create).toHaveBeenLastCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ PrecioUnitario: 0.8, Costo: 0.8 }) }),
        );

        jest.spyOn(service, 'ahora').mockReturnValue(new Date('2026-11-20T12:00:00.000Z'));
        await service.escalar(4);
        expect(prisma.waConsumo.create).toHaveBeenLastCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ PrecioUnitario: 1.2, Costo: 1.2 }) }),
        );
    });

    it('rechaza una audiencia vacía', async () => {
        const prisma = prismaDe();
        prisma.comComunicados.findFirst.mockResolvedValue(fila('BORRADOR'));
        prisma.comComunicadoVersiones.findUnique.mockResolvedValue(version);
        resolver.resolve.mockResolvedValue({ ids: [], fueraDeAlcance: [] });
        const service = await servicio(prisma);
        await expect(service.enviar(usuario, 10, 9)).rejects.toBeInstanceOf(HttpException);
    });

    it('reencola solo a pendientes, suma el recordatorio y omite a quien ya no tiene canal', async () => {
        const prisma = prismaDe();
        prisma.comComunicados.findFirst.mockResolvedValue(fila('ENVIADO', { Prioridad: 'NORMAL', CanalesForzados: null }));
        prisma.comConfigEmpresa.findUnique.mockResolvedValue({ PoliticaWhatsApp: 'NUNCA', PlantillasWhatsApp: null });
        prisma.comDestinatarios.findMany.mockResolvedValue([
            { idDestinatario: 1, idEmpleado: 10 },
            { idDestinatario: 2, idEmpleado: 11 },
        ]);
        canales.forEmployees.mockResolvedValue({
            porEmpleado: [
                { idEmpleado: 10, canales: ['APP', 'WEB'], sinCanal: false, nivelPerfil: 'DEFAULT' },
                { idEmpleado: 11, canales: [], sinCanal: true, nivelPerfil: 'DEFAULT' },
            ],
            resumen: { APP: 1, WHATSAPP: 0, CORREO: 0, KIOSCO: 0, SIN_CANAL: 1 },
        });
        const service = await servicio(prisma);
        const resultado = await service.reencolarPendientes(9, [1, 2, 99]);
        expect(prisma.comDestinatarios.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { idComunicado: 9, idDestinatario: { in: [1, 2, 99] }, Estado: 'PENDIENTE' },
            }),
        );
        expect(prisma.comDestinatarios.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { idDestinatario: 1 },
                data: expect.objectContaining({
                    RecordatoriosEnviados: { increment: 1 },
                    UltimoIntentoEn: null,
                    Estado: 'PENDIENTE',
                }),
            }),
        );
        expect(prisma.comDestinatarios.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { idDestinatario: 2 },
                data: expect.objectContaining({ Estado: 'SIN_CANAL', RecordatoriosEnviados: { increment: 1 } }),
            }),
        );
        expect(colaEnvio.add).toHaveBeenCalledWith('lote', { idComunicado: 9, ids: [1] }, expect.objectContaining({ attempts: 3 }));
        expect(resultado).toEqual({ reenviados: 1, sinCanal: 1 });
    });
});
