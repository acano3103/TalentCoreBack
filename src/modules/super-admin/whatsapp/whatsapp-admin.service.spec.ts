jest.mock('src/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { HttpException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { WhatsappAdminService } from './whatsapp-admin.service';

const usuario = {
    id: 1,
    uuid: '22222222-2222-4222-8222-222222222222',
    idTenant: 1,
    username: 'root',
    first_name: 'Super',
    last_name: 'Admin',
} as ActiveUserDto;

describe('WhatsappAdminService', () => {
    const updateConsumo = jest.fn();
    const updateManyConsumo = jest.fn();
    const tx = {
        waPrecios: { create: jest.fn() },
        historicoMovimientos: { create: jest.fn() },
        waTopes: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    };
    const prisma = {
        catTenants: { findMany: jest.fn(), findUnique: jest.fn() },
        catEmpresas: { findMany: jest.fn(), findFirst: jest.fn() },
        waConsumo: { groupBy: jest.fn(), update: updateConsumo, updateMany: updateManyConsumo },
        waPrecios: { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
        waTopes: { findMany: jest.fn() },
        $transaction: jest.fn(async (fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const service = new WhatsappAdminService(prisma as unknown as PrismaService);

    beforeEach(() => {
        jest.clearAllMocks();
        prisma.catTenants.findUnique.mockResolvedValue({ idTenant: 3 });
        prisma.catEmpresas.findFirst.mockResolvedValue({ idEmpresa: 10 });
        tx.waPrecios.create.mockResolvedValue({
            id: 8,
            idTenant: 3,
            PrecioBase: 1.5,
            Moneda: 'MXN',
            VigenteDesde: new Date('2099-01-01T06:00:00.000Z'),
        });
        tx.historicoMovimientos.create.mockResolvedValue({});
    });

    it('crea la versión futura, la deja en la bitácora y no toca el consumo histórico', async () => {
        const creado = await service.crearPrecio(usuario, {
            idTenant: 3,
            precioBase: 1.5,
            vigenteDesde: '2099-01-01T06:00:00.000Z',
            preciosCategoria: { CRITICA: 1.8 },
        });

        expect(creado.id).toBe(8);
        expect(tx.waPrecios.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ idTenant: 3, PrecioBase: 1.5, PreciosCategoria: { CRITICA: 1.8 } }),
            }),
        );
        expect(tx.historicoMovimientos.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ tablaOrigen: 'WaPrecios', accion: 'CREAR' }) }),
        );
        expect(updateConsumo).not.toHaveBeenCalled();
        expect(updateManyConsumo).not.toHaveBeenCalled();
        expect(prisma.waPrecios.update).not.toHaveBeenCalled();
        expect(prisma.waPrecios.updateMany).not.toHaveBeenCalled();
    });

    it('rechaza una vigencia anterior a hoy', async () => {
        await expect(
            service.crearPrecio(usuario, { idTenant: null, precioBase: 0.4, vigenteDesde: '2020-01-01T00:00:00.000Z' }),
        ).rejects.toBeInstanceOf(HttpException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('separa el precio vigente del programado', async () => {
        prisma.waPrecios.findMany.mockResolvedValue([
            {
                id: 2,
                idTenant: 3,
                PrecioBase: 0.8,
                PreciosCategoria: null,
                Moneda: 'MXN',
                VigenteDesde: new Date('2026-01-01T06:00:00.000Z'),
            },
            {
                id: 3,
                idTenant: 3,
                PrecioBase: 1.5,
                PreciosCategoria: null,
                Moneda: 'MXN',
                VigenteDesde: new Date('2099-01-01T06:00:00.000Z'),
            },
        ]);

        const precios = await service.precios(3);
        expect(precios.find((fila) => fila.id === 2)?.estado).toBe('VIGENTE');
        expect(precios.find((fila) => fila.id === 3)?.estado).toBe('PROGRAMADO');
    });
});
