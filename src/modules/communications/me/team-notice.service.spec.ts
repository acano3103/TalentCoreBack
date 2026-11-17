jest.mock('src/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../delivery/announcement-dispatch.service', () => ({ AnnouncementDispatchService: class AnnouncementDispatchService {} }));
jest.mock('../capabilities/comms-capability.service', () => ({ CommsCapabilityService: class CommsCapabilityService {} }));
jest.mock('../audiences/audience-resolver.service', () => ({ AudienceResolverService: class AudienceResolverService {} }));
jest.mock('../channels/effective-channel.service', () => ({ EffectiveChannelService: class EffectiveChannelService {} }));
jest.mock('../whatsapp-usage/whatsapp-cap.service', () => ({ WhatsAppCapService: class WhatsAppCapService {} }));

import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { AudienceResolverService } from '../audiences/audience-resolver.service';
import { CommsCapabilityService } from '../capabilities/comms-capability.service';
import { EffectiveChannelService } from '../channels/effective-channel.service';
import { AnnouncementDispatchService } from '../delivery/announcement-dispatch.service';
import { WhatsAppCapService } from '../whatsapp-usage/whatsapp-cap.service';
import { htmlDeTextoPlano } from './team-notice.plan';
import { TeamNoticeService } from './team-notice.service';

const usuario = {
    id: 7,
    uuid: '11111111-1111-4111-8111-111111111111',
    idTenant: 3,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'López',
} as ActiveUserDto;

const ahora = new Date('2026-11-16T18:00:00.000Z');

describe('TeamNoticeService', () => {
    const prisma = {
        empleados: { findFirst: jest.fn(), findMany: jest.fn() },
        catSites: { findUnique: jest.fn() },
        comConfigEmpresa: { findUnique: jest.fn() },
        comTiposComunicado: { findFirst: jest.fn() },
        comComunicados: { count: jest.fn(), findMany: jest.fn() },
        comDestinatarios: { groupBy: jest.fn() },
        $transaction: jest.fn(),
    };
    const capabilities = { getEffective: jest.fn(), contexto: jest.fn() };
    const resolver = { resolve: jest.fn() };
    const canales = { forEmployees: jest.fn() };
    const envio = { enviar: jest.fn() };
    const caps = { precioActual: jest.fn() };
    let service: TeamNoticeService;

    beforeEach(async () => {
        jest.clearAllMocks();
        prisma.empleados.findFirst.mockResolvedValue({ idEmpleado: 8, idSite: null });
        prisma.catSites.findUnique.mockResolvedValue({ zonaHoraria: 'America/Mexico_City' });
        const module = await Test.createTestingModule({
            providers: [
                TeamNoticeService,
                { provide: PrismaService, useValue: prisma },
                { provide: CommsCapabilityService, useValue: capabilities },
                { provide: AudienceResolverService, useValue: resolver },
                { provide: EffectiveChannelService, useValue: canales },
                { provide: AnnouncementDispatchService, useValue: envio },
                { provide: WhatsAppCapService, useValue: caps },
            ],
        }).compile();
        service = module.get(TeamNoticeService);
        service.ahora = () => ahora;
    });

    function permitir() {
        capabilities.getEffective.mockResolvedValue([
            { codigo: 'COM_CREAR', tiposPermitidos: ['AVISO_EQUIPO'], alcance: 'EQUIPO_DIRECTO', referencias: null },
        ]);
    }

    it('sin capacidad responde 403', async () => {
        capabilities.getEffective.mockResolvedValue([]);
        const error = await service.vistaPrevia(usuario, 10, false).catch((causa) => causa);
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(403);
        expect(error.getResponse()).toMatchObject({ code: 'SIN_CAPACIDAD' });
    });

    it('un rol que no puede AVISO_EQUIPO responde 403', async () => {
        capabilities.getEffective.mockResolvedValue([{ codigo: 'COM_CREAR', tiposPermitidos: ['GENERAL'], alcance: 'TENANT', referencias: null }]);
        const error = await service.crear(usuario, 10, aviso()).catch((causa) => causa);
        expect(error.getStatus()).toBe(403);
        expect(error.getResponse()).toMatchObject({ code: 'TIPO_NO_PERMITIDO' });
    });

    it('el undécimo aviso del día responde 429', async () => {
        permitir();
        prisma.comComunicados.count.mockResolvedValue(10);
        const error = await service.crear(usuario, 10, aviso()).catch((causa) => causa);
        expect(error.getStatus()).toBe(429);
        expect(error.getResponse()).toMatchObject({ code: 'LIMITE_AVISOS' });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('la vista previa separa app, web, WhatsApp y quien se queda sin canal', async () => {
        permitir();
        capabilities.contexto.mockResolvedValue({ idTenant: 3, companyId: 10, alcance: 'EQUIPO_DIRECTO', idEmpleado: 8 });
        resolver.resolve.mockResolvedValue({ ids: [2, 3, 4], fueraDeAlcance: [] });
        canales.forEmployees.mockResolvedValue({
            porEmpleado: [
                { idEmpleado: 2, canales: ['APP', 'WEB'] },
                { idEmpleado: 3, canales: ['WEB'] },
                { idEmpleado: 4, canales: [] },
            ],
        });
        prisma.empleados.findMany.mockResolvedValue([
            { idEmpleado: 2, telefonoMovil: '5500000002' },
            { idEmpleado: 3, telefonoMovil: '5500000003' },
            { idEmpleado: 4, telefonoMovil: null },
        ]);
        prisma.comConfigEmpresa.findUnique.mockResolvedValue({ PoliticaWhatsApp: 'IMPORTANTE_CRITICA' });
        caps.precioActual.mockResolvedValue({ precio: 0.8, moneda: 'MXN' });

        const previa = await service.vistaPrevia(usuario, 10, true);

        expect(resolver.resolve).toHaveBeenCalledWith(
            { jefes: [{ idEmpleado: 8, alcance: 'DIRECTO' }] },
            expect.objectContaining({ alcance: 'EQUIPO_DIRECTO' }),
        );
        expect(previa).toEqual({
            total: 3,
            conApp: 1,
            soloWeb: 1,
            porWhatsApp: 1,
            sinCanal: 1,
            costoWhatsAppEstimado: 0.8,
        });
    });

    it('crea el aviso con HTML escapado y respeta el motivo de WhatsApp', async () => {
        permitir();
        prisma.comComunicados.count.mockResolvedValue(0);
        capabilities.contexto.mockResolvedValue({ idTenant: 3, companyId: 10, alcance: 'EQUIPO_DIRECTO', idEmpleado: 8 });
        resolver.resolve.mockResolvedValue({ ids: [2], fueraDeAlcance: [] });
        prisma.comTiposComunicado.findFirst.mockResolvedValue({ idTipo: 6, Codigo: 'AVISO_EQUIPO', EsCorto: false });
        const versiones = { create: jest.fn() };
        prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<number>) =>
            fn({
                comComunicados: { create: jest.fn(async () => ({ idComunicado: 15 })) },
                comComunicadoVersiones: versiones,
                historicoMovimientos: { create: jest.fn() },
            }),
        );
        envio.enviar.mockResolvedValue({
            id: 15,
            estado: 'ENVIADO',
            totalDestinatarios: 2,
            idempotente: false,
            whatsapp: { enviados: 0, motivoOmitido: 'PLANTILLA_NO_APROBADA' },
        });

        const creado = await service.crear(usuario, 10, aviso({ mensaje: 'Hola <equipo> &\n\nLínea 2' }));

        expect(versiones.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                Titulo: 'Cierre de caja',
                CuerpoHtml: '<p>Hola &lt;equipo&gt; &amp;</p><p>Línea 2</p>',
            }),
        });
        expect(envio.enviar).toHaveBeenCalledWith(usuario, 10, 15, { whatsappSinApp: true });
        expect(creado).toEqual({
            id: 15,
            totalDestinatarios: 2,
            whatsapp: { enviados: 0, motivoOmitido: 'PLANTILLA_NO_APROBADA' },
        });
    });
});

describe('html del aviso', () => {
    it('escapa el texto plano', () => {
        expect(htmlDeTextoPlano('a < b & c')).toBe('<p>a &lt; b &amp; c</p>');
    });
});

function aviso(parcial: Partial<{ titulo: string; mensaje: string; pedirConfirmacion: boolean; whatsappSinApp: boolean }> = {}) {
    return {
        titulo: 'Cierre de caja',
        mensaje: 'Hoy cerramos a las 8.',
        pedirConfirmacion: true,
        whatsappSinApp: true,
        ...parcial,
    };
}
