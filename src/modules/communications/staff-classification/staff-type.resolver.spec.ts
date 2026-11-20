jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { StaffTypeResolver } from './staff-type.resolver';

describe('StaffTypeResolver', () => {
    let resolver: StaffTypeResolver;
    const findUnique = jest.fn();

    beforeEach(async () => {
        findUnique.mockReset();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                StaffTypeResolver,
                { provide: PrismaService, useValue: { empleados: { findUnique } } },
            ],
        }).compile();
        resolver = module.get(StaffTypeResolver);
    });

    it('el override del empleado gana sobre el tipo del puesto', async () => {
        findUnique.mockResolvedValue({
            idTipoPersonalOverride: 7,
            CatPuestos: { idTipoPersonal: 3 },
        });

        await expect(resolver.forEmployee(15)).resolves.toBe(7);
        expect(findUnique).toHaveBeenCalledWith({
            where: { idEmpleado: 15 },
            select: {
                idTipoPersonalOverride: true,
                CatPuestos: { select: { idTipoPersonal: true } },
            },
        });
    });

    it('usa el tipo del puesto cuando no hay override', async () => {
        findUnique.mockResolvedValue({
            idTipoPersonalOverride: null,
            CatPuestos: { idTipoPersonal: 3 },
        });

        await expect(resolver.forEmployee(15)).resolves.toBe(3);
    });

    it('devuelve null cuando el empleado no tiene puesto', async () => {
        findUnique.mockResolvedValue({
            idTipoPersonalOverride: null,
            CatPuestos: null,
        });

        await expect(resolver.forEmployee(15)).resolves.toBeNull();
    });

    it('devuelve null cuando el puesto no tiene tipo de personal', async () => {
        findUnique.mockResolvedValue({
            idTipoPersonalOverride: null,
            CatPuestos: { idTipoPersonal: null },
        });

        await expect(resolver.forEmployee(15)).resolves.toBeNull();
    });

    it('el override sigue ganando aunque el empleado no tenga puesto', async () => {
        findUnique.mockResolvedValue({
            idTipoPersonalOverride: 7,
            CatPuestos: null,
        });

        await expect(resolver.forEmployee(15)).resolves.toBe(7);
    });

    it('devuelve null si el empleado no existe', async () => {
        findUnique.mockResolvedValue(null);

        await expect(resolver.forEmployee(99)).resolves.toBeNull();
    });
});
