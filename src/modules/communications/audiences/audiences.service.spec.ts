jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CommsCapabilityService } from '../capabilities/comms-capability.service';
import { EffectiveChannelService } from '../channels/effective-channel.service';
import { AudienceOptionsService } from './audience-options.service';
import { AudiencePreviewStore, MemoryAudiencePreviewStore } from './audience-preview.store';
import { AudienceResolverService } from './audience-resolver.service';
import { AudiencesService } from './audiences.service';

const usuario = {
    id: 7,
    uuid: '11111111-1111-4111-8111-111111111111',
    idTenant: 3,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'López',
} as ActiveUserDto;

describe('AudiencesService', () => {
    let service: AudiencesService;
    const resolver = { resolve: jest.fn(), enAlcance: jest.fn() };
    const canales = { forEmployees: jest.fn() };
    const capabilities = { contexto: jest.fn() };
    const opciones = { listar: jest.fn() };
    const tx = {
        comAudiencias: { create: jest.fn(), update: jest.fn() },
        comAudienciaPersonas: { createMany: jest.fn(), deleteMany: jest.fn() },
        historicoMovimientos: { create: jest.fn() },
    };
    const prisma = {
        $queryRaw: jest.fn(),
        $transaction: jest.fn((fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
        empleados: { findMany: jest.fn() },
        waPrecios: { findFirst: jest.fn() },
        comAudiencias: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
        comAudienciaPersonas: { count: jest.fn() },
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        capabilities.contexto.mockResolvedValue({
            idTenant: 3,
            companyId: 10,
            idEmpleado: 1,
            alcance: 'TENANT',
            referencias: null,
            sitesUsuario: [],
            unidadPorSite: new Map(),
        });
        canales.forEmployees.mockImplementation(async (ids: number[]) => ({
            porEmpleado: ids.map((id) => ({
                idEmpleado: id,
                canales: ['APP'],
                sinCanal: false,
                nivelPerfil: 'DEFAULT',
            })),
            resumen: { APP: ids.length, WEB: 0, WHATSAPP: 1, CORREO: 0, KIOSCO: 0, SIN_CANAL: 0 },
        }));
        prisma.empleados.findMany.mockImplementation(async ({ where }: { where: { idEmpleado: { in: number[] } } }) =>
            where.idEmpleado.in.map((id) => ({
                idEmpleado: id,
                nombre: 'Ana',
                primerApellido: String(id),
                segundoApellido: null,
                numeroEmpleado: `E${id}`,
            })),
        );
        prisma.waPrecios.findFirst.mockResolvedValue({ PrecioBase: { toString: () => '2.0000' } });

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AudiencesService,
                { provide: PrismaService, useValue: prisma },
                { provide: CommsCapabilityService, useValue: capabilities },
                { provide: AudienceResolverService, useValue: resolver },
                { provide: EffectiveChannelService, useValue: canales },
                { provide: AudiencePreviewStore, useClass: MemoryAudiencePreviewStore },
                { provide: AudienceOptionsService, useValue: opciones },
            ],
        }).compile();
        service = module.get(AudiencesService);
    });

    it('el total de la vista previa y la lista paginada son el mismo conjunto', async () => {
        resolver.resolve.mockResolvedValue({ ids: [1, 2, 3, 4, 5], fueraDeAlcance: [9] });

        const previa = await service.preview(usuario, 10, { ubicaciones: [1] });
        const paginas = await Promise.all([
            service.destinatarios(usuario, 10, previa.previewId, 1, 2),
            service.destinatarios(usuario, 10, previa.previewId, 2, 2),
            service.destinatarios(usuario, 10, previa.previewId, 3, 2),
        ]);

        expect(previa.total).toBe(5);
        expect(previa.fueraDeAlcance).toEqual([9]);
        expect(previa.costoWhatsAppEstimado).toBe('2.0000');
        expect(previa.muestra.map((persona) => persona.idEmpleado)).toEqual([1, 2, 3, 4, 5]);
        expect(paginas.flatMap((pagina) => pagina.items.map((persona) => persona.idEmpleado))).toEqual([1, 2, 3, 4, 5]);
        expect(paginas.every((pagina) => pagina.total === previa.total)).toBe(true);
    });

    it('no guarda una audiencia si hay ids fuera del alcance', async () => {
        resolver.resolve.mockResolvedValue({ ids: [1], fueraDeAlcance: [9] });

        await expect(
            service.crear(usuario, 10, { nombre: 'Turno', tipo: 'FIJA', criterios: { agregarEmpleados: [9] } }),
        ).rejects.toBeInstanceOf(HttpException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('una audiencia dinámica guarda criterios y no congela personas', async () => {
        resolver.resolve.mockResolvedValue({ ids: [1, 2], fueraDeAlcance: [] });
        tx.comAudiencias.create.mockResolvedValue({
            idAudiencia: 15,
            Nombre: 'Turno',
            Tipo: 'DINAMICA',
            Criterios: { ubicaciones: [1] },
            Activo: true,
            FechaRegistro: new Date('2026-11-14T00:00:00Z'),
        });

        const guardada = await service.crear(usuario, 10, {
            nombre: 'Turno',
            tipo: 'DINAMICA',
            criterios: { ubicaciones: [1] },
        });

        expect(guardada.totalPersonas).toBeNull();
        expect(tx.comAudienciaPersonas.createMany).not.toHaveBeenCalled();
        expect(tx.comAudiencias.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ Tipo: 'DINAMICA' }) }),
        );
    });
});
