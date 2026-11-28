jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { PositionTagsService } from './position-tags.service';

describe('PositionTagsService', () => {
    let service: PositionTagsService;
    const prisma = {
        catEtiquetasPuesto: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
        },
    };

    beforeEach(async () => {
        jest.resetAllMocks();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PositionTagsService,
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile();
        service = module.get(PositionTagsService);
    });

    it('busca como máximo 20 etiquetas activas del tenant, en orden alfabético', async () => {
        prisma.catEtiquetasPuesto.findMany.mockResolvedValue([
            { idEtiqueta: 2, Nombre: 'Caja', Activo: true },
        ]);

        await expect(service.buscar(4, 9, '  caja  ')).resolves.toEqual([
            { id: 2, nombre: 'Caja', activo: true },
        ]);
        expect(prisma.catEtiquetasPuesto.findMany).toHaveBeenCalledWith({
            where: { idTenant: 4, Activo: true, Nombre: { contains: 'caja' } },
            orderBy: { Nombre: 'asc' },
            take: 20,
            select: { idEtiqueta: true, Nombre: true, Activo: true },
        });
    });

    it('devuelve la etiqueta existente si el nombre ya está, sin distinguir mayúsculas', async () => {
        prisma.catEtiquetasPuesto.findMany.mockResolvedValue([
            { idEtiqueta: 3, Nombre: 'Turno Noche', Activo: true },
        ]);

        await expect(service.crear(4, 9, 'turno noche')).resolves.toEqual({
            id: 3,
            nombre: 'Turno Noche',
            activo: true,
            yaExistia: true,
        });
        expect(prisma.catEtiquetasPuesto.create).not.toHaveBeenCalled();
    });

    it('crea la etiqueta cuando el tenant no la tiene', async () => {
        prisma.catEtiquetasPuesto.findMany.mockResolvedValue([]);
        prisma.catEtiquetasPuesto.create.mockResolvedValue({
            idEtiqueta: 8,
            Nombre: 'Turno noche',
            Activo: true,
        });

        await expect(service.crear(4, 9, 'Turno noche')).resolves.toEqual({
            id: 8,
            nombre: 'Turno noche',
            activo: true,
            yaExistia: false,
        });
    });
});

describe('PositionTagsService errores', () => {
    it('el nombre vacío no se guarda', async () => {
        const prisma = {
            catEtiquetasPuesto: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
        };
        const module: TestingModule = await Test.createTestingModule({
            providers: [PositionTagsService, { provide: PrismaService, useValue: prisma }],
        }).compile();
        const service = module.get(PositionTagsService);

        await expect(service.crear(4, 9, '   ')).rejects.toBeInstanceOf(HttpException);
        try {
            await service.crear(4, 9, '   ');
        } catch (error) {
            expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
        }
        expect(prisma.catEtiquetasPuesto.create).not.toHaveBeenCalled();
    });
});
