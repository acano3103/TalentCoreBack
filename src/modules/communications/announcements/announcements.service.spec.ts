jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { errorComms } from '../comms-http';
import { CommsCapabilityService } from '../capabilities/comms-capability.service';
import { AudienceResolverService } from '../audiences/audience-resolver.service';
import { EffectiveChannelService } from '../channels/effective-channel.service';
import { AnnouncementDispatchService } from '../delivery/announcement-dispatch.service';
import { AnnouncementsService } from './announcements.service';
import { CommsStorageService } from './comms-storage.service';

const usuario = {
    id: 7,
    uuid: '11111111-1111-4111-8111-111111111111',
    idTenant: 3,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'López',
} as ActiveUserDto;

const tipo = {
    idTipo: 2,
    idTenant: 3,
    Codigo: 'POLITICA',
    Nombre: 'Política',
    PrioridadDefault: 'IMPORTANTE',
    AcuseDefault: 'LEI_ENTENDI',
    ModalDefault: true,
    IdentidadDefault: false,
    EsCorto: false,
    Activo: true,
};

function comunicado(acuse: string, estado = 'ENVIADO') {
    return {
        idComunicado: 9,
        idTenant: 3,
        idEmpresa: 10,
        idTipo: 2,
        Estado: estado,
        Prioridad: 'IMPORTANTE',
        AcuseModo: acuse,
        MostrarModal: true,
        RequiereIdentidad: false,
        IncluirNuevos: false,
        PermitePregunta: false,
        CanalesForzados: null,
        Escalamiento: null,
        RecordatorioCadaDias: null,
        RecordatorioMax: null,
        CtaTipo: null,
        CtaTexto: null,
        CtaDestino: null,
        Categoria: null,
        idAudiencia: null,
        CriteriosAudiencia: {},
        ProgramadoPara: null,
        EnviadoEn: new Date('2026-11-01T00:00:00Z'),
        VigenteHasta: null,
        VersionActual: 1,
        TotalDestinatarios: 4,
        CreadoPor: usuario.uuid,
        FechaRegistro: new Date('2026-11-01T00:00:00Z'),
        ArchivadoEn: null,
        ComTiposComunicado: tipo,
    };
}

const version = {
    idVersion: 4,
    idComunicado: 9,
    NumVersion: 1,
    Titulo: 'Política de asistencia',
    Resumen: 'Lee y confirma',
    CuerpoHtml: '<p>Texto</p>',
    PortadaRuta: null,
    CreadoPor: usuario.uuid,
    EsCorreccionMenor: false,
};

describe('AnnouncementsService versiones', () => {
    const tx = {
        comComunicadoVersiones: { update: jest.fn(), create: jest.fn() },
        comComunicadoAdjuntos: { findMany: jest.fn(), createMany: jest.fn(), create: jest.fn() },
        comComunicados: { update: jest.fn() },
        comDestinatarios: { updateMany: jest.fn() },
        historicoMovimientos: { create: jest.fn() },
    };
    const prisma = {
        $transaction: jest.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
        comTiposComunicado: { findFirst: jest.fn() },
        comComunicados: { findFirst: jest.fn() },
        comComunicadoVersiones: { findUnique: jest.fn() },
        comComunicadoAdjuntos: { findMany: jest.fn(), count: jest.fn() },
        empleados: { findMany: jest.fn() },
        auth_user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const capabilities = { contexto: jest.fn(), getEffective: jest.fn() };
    const envio = { notificarActualizacion: jest.fn(), quitarProgramado: jest.fn() };
    const storage = {
        signedUrl: jest.fn(() => '/firmado'),
        enlaceArchivo: jest.fn(() => ({ url: '/api/v2/public/comms/files/firma', ruta: 'public/comms/files/firma' })),
        get: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    };
    let service: AnnouncementsService;

    beforeEach(async () => {
        jest.clearAllMocks();
        capabilities.contexto.mockImplementation(async (codigo: string) => {
            if (codigo === 'COM_VER_ANALITICA') {
                throw errorComms(HttpStatus.FORBIDDEN, 'SIN_CAPACIDAD', 'No tienes permiso para esta acción.');
            }
            return { idTenant: 3, companyId: 10, idEmpleado: 1, alcance: 'TENANT', referencias: null, sitesUsuario: [], unidadPorSite: new Map() };
        });
        capabilities.getEffective.mockResolvedValue([{ codigo: 'COM_CREAR', alcance: 'TENANT', referencias: null, tiposPermitidos: null }]);
        prisma.comTiposComunicado.findFirst.mockResolvedValue(tipo);
        prisma.comComunicadoVersiones.findUnique.mockResolvedValue(version);
        prisma.comComunicadoAdjuntos.findMany.mockResolvedValue([]);
        prisma.comComunicadoAdjuntos.count.mockResolvedValue(0);
        storage.put.mockResolvedValue('3/10/comms/9/adjuntos/archivo.pdf');
        tx.comComunicadoAdjuntos.findMany.mockResolvedValue([{ idAdjunto: 1, Nombre: 'a.pdf', Ruta: '3/10/comms/9/adjuntos/a.pdf', Mime: 'application/pdf', TamanoBytes: 10 }]);
        tx.comComunicadoVersiones.create.mockResolvedValue({ idVersion: 8 });
        tx.comComunicadoVersiones.update.mockResolvedValue(version);
        tx.comComunicados.update.mockResolvedValue({});
        tx.comDestinatarios.updateMany.mockResolvedValue({ count: 2 });
        tx.historicoMovimientos.create.mockResolvedValue({});

        const module = await Test.createTestingModule({
            providers: [
                AnnouncementsService,
                { provide: PrismaService, useValue: prisma },
                { provide: CommsCapabilityService, useValue: capabilities },
                { provide: AudienceResolverService, useValue: { resolve: jest.fn() } },
                { provide: EffectiveChannelService, useValue: { forEmployees: jest.fn() } },
                { provide: CommsStorageService, useValue: storage },
                { provide: AnnouncementDispatchService, useValue: envio },
            ],
        }).compile();
        service = module.get(AnnouncementsService);
    });

    it('la corrección menor actualiza la versión vigente y no toca los acuses', async () => {
        prisma.comComunicados.findFirst.mockResolvedValue(comunicado('LEI_ENTENDI'));
        await service.nuevaVersion(usuario, 10, 9, { correccionMenor: true, cuerpoHtml: '<p>Texto corregido</p>' });
        expect(tx.comComunicadoVersiones.update).toHaveBeenCalledWith({
            where: { idVersion: 4 },
            data: expect.objectContaining({ CuerpoHtml: '<p>Texto corregido</p>', EsCorreccionMenor: true }),
        });
        expect(tx.comComunicadoVersiones.create).not.toHaveBeenCalled();
        expect(tx.comDestinatarios.updateMany).not.toHaveBeenCalled();
        expect(envio.notificarActualizacion).not.toHaveBeenCalled();
    });

    it('la versión mayor incrementa la versión y regresa CONFIRMADO a PENDIENTE', async () => {
        prisma.comComunicados.findFirst.mockResolvedValue(comunicado('LEI_ENTENDI'));
        await service.nuevaVersion(usuario, 10, 9, { correccionMenor: false, titulo: 'Política nueva' });
        expect(tx.comComunicadoVersiones.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ NumVersion: 2, Titulo: 'Política nueva' }),
        });
        expect(tx.comComunicados.update).toHaveBeenCalledWith({ where: { idComunicado: 9 }, data: { VersionActual: 2 } });
        expect(tx.comDestinatarios.updateMany).toHaveBeenCalledWith({
            where: { idComunicado: 9, Estado: 'CONFIRMADO' },
            data: { Estado: 'PENDIENTE' },
        });
        expect(tx.comComunicadoAdjuntos.createMany).toHaveBeenCalled();
        expect(envio.notificarActualizacion).toHaveBeenCalledWith(9);
    });

    it('sin acuse no regresa confirmaciones', async () => {
        prisma.comComunicados.findFirst.mockResolvedValue(comunicado('NINGUNO'));
        await service.nuevaVersion(usuario, 10, 9, { correccionMenor: false });
        expect(tx.comDestinatarios.updateMany).not.toHaveBeenCalled();
    });

    it('rechaza versionar un borrador', async () => {
        prisma.comComunicados.findFirst.mockResolvedValue(comunicado('LEI_ENTENDI', 'BORRADOR'));
        await expect(service.nuevaVersion(usuario, 10, 9, { correccionMenor: false })).rejects.toBeInstanceOf(HttpException);
    });

    it('guarda el nombre visible en UTF-8 aunque Multer lo entregue en latin1', async () => {
        prisma.comComunicados.findFirst.mockResolvedValue(comunicado('NINGUNO', 'BORRADOR'));
        const pdf = Buffer.from('%PDF-1.4 contenido');
        for (const visible of ['Módulos.pdf', 'Implementación.pdf', 'Año.pdf']) {
            storage.put.mockClear();
            tx.comComunicadoAdjuntos.create.mockClear();
            await service.agregarAdjunto(usuario, 10, 9, archivo(pdf, 'application/pdf', comoMulter(visible)));
            expect(tx.comComunicadoAdjuntos.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ Nombre: visible, Mime: 'application/pdf' }),
            });
            expect(storage.put.mock.calls[0][1].nombre as string).not.toContain('Ã');
        }
    });

    it('la portada también recupera el nombre con acentos', async () => {
        prisma.comComunicados.findFirst.mockResolvedValue(comunicado('NINGUNO', 'BORRADOR'));
        const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png')]);
        await service.portada(usuario, 10, 9, archivo(png, 'image/png', comoMulter('Implementación.png')));
        expect(storage.put.mock.calls[0][1].nombre as string).toMatch(/-Implementaci_n\.png$/);
    });

    it('el detalle incluye la ruta relativa de la portada y del adjunto', async () => {
        prisma.comComunicados.findFirst.mockResolvedValue(comunicado('NINGUNO', 'BORRADOR'));
        prisma.comComunicadoVersiones.findUnique.mockResolvedValue({ ...version, PortadaRuta: '3/10/comms/9/portada/foto.png' });
        prisma.comComunicadoAdjuntos.findMany.mockResolvedValue([
            { idAdjunto: 1, Nombre: 'Módulos.pdf', Ruta: '3/10/comms/9/adjuntos/a.pdf', Mime: 'application/pdf', TamanoBytes: 10 },
        ]);
        const detalle = await service.detalle(usuario, 10, 9);
        expect(detalle.version.portadaRuta).toBe('public/comms/files/firma');
        expect(detalle.version.portadaUrl).toBe('/api/v2/public/comms/files/firma');
        expect(detalle.version.adjuntos[0]).toMatchObject({ nombre: 'Módulos.pdf', ruta: 'public/comms/files/firma' });
    });
});

function comoMulter(nombre: string): string {
    return Buffer.from(nombre, 'utf8').toString('latin1');
}

function archivo(buffer: Buffer, mimetype: string, originalname: string): Express.Multer.File {
    return { buffer, mimetype, originalname, size: buffer.length } as Express.Multer.File;
}
