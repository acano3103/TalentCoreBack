jest.mock('src/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { HttpException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CommsCapabilityService } from '../capabilities/comms-capability.service';
import { WhatsAppCapService } from './whatsapp-cap.service';
import { WhatsappUsageService } from './whatsapp-usage.service';

const usuario = (idTenant: number) =>
    ({
        id: 7,
        uuid: '11111111-1111-4111-8111-111111111111',
        idTenant,
        username: 'ana',
        first_name: 'Ana',
        last_name: 'López',
    }) as ActiveUserDto;

const CONSUMO = [
    { idTenant: 3, idEmpresa: 10, CategoriaInterna: 'NORMAL', Costo: 10 },
    { idTenant: 9, idEmpresa: 20, CategoriaInterna: 'NORMAL', Costo: 999 },
];

describe('WhatsappUsageService', () => {
    const getEffective = jest.fn();
    const prisma = {
        waConsumo: { groupBy: jest.fn(), findMany: jest.fn() },
        waTopes: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
        waPrecios: { findMany: jest.fn() },
        catEmpresas: { findMany: jest.fn(), findFirst: jest.fn() },
        $queryRaw: jest.fn(),
        $transaction: jest.fn(),
    };
    const caps = { precioActual: jest.fn(), estado: jest.fn() };
    const service = new WhatsappUsageService(
        prisma as unknown as PrismaService,
        { getEffective } as unknown as CommsCapabilityService,
        caps as unknown as WhatsAppCapService,
    );

    beforeEach(() => {
        jest.clearAllMocks();
        getEffective.mockResolvedValue([
            { codigo: 'CFG_CANALES', alcance: 'TENANT', referencias: null, tiposPermitidos: null },
        ]);
        prisma.waConsumo.groupBy.mockImplementation(async ({ where }: { where: { idTenant?: number } }) => {
            if (typeof where.idTenant !== 'number') throw new Error('la consulta no aisló el tenant');
            return CONSUMO.filter((fila) => fila.idTenant === where.idTenant).map((fila) => ({
                idEmpresa: fila.idEmpresa,
                CategoriaInterna: fila.CategoriaInterna,
                _sum: { Costo: fila.Costo },
                _count: { _all: 1 },
            }));
        });
        prisma.waTopes.findMany.mockResolvedValue([]);
        prisma.catEmpresas.findMany.mockResolvedValue([]);
        prisma.catEmpresas.findFirst.mockImplementation(async ({ where }: { where: { idTenant: number; idEmpresa: number } }) =>
            CONSUMO.some((fila) => fila.idTenant === where.idTenant && fila.idEmpresa === where.idEmpresa)
                ? { idEmpresa: where.idEmpresa }
                : null,
        );
        caps.precioActual.mockResolvedValue({ precio: 0.8, moneda: 'MXN' });
    });

    it('un tenant nunca ve el consumo de otro', async () => {
        const propio = await service.resumen(usuario(3), 10, { mes: '2026-11' });
        const ajeno = await service.resumen(usuario(9), 10, { mes: '2026-11' });

        expect(propio.mensajes).toBe(1);
        expect(propio.costo).toBe(10);
        expect(propio.precioVigente).toBe(0.8);
        expect(ajeno.costo).toBe(999);
        expect(JSON.stringify(propio)).not.toContain('999');
        expect(JSON.stringify(ajeno)).not.toContain('"costo":10');
        expect(prisma.waConsumo.groupBy).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ idTenant: 3 }) }),
        );
    });

    it('rechaza una empresa que no es del tenant', async () => {
        await expect(service.resumen(usuario(3), 10, { mes: '2026-11', empresa: 20 })).rejects.toBeInstanceOf(HttpException);
        try {
            await service.resumen(usuario(3), 10, { mes: '2026-11', empresa: 20 });
        } catch (error) {
            expect((error as HttpException).getResponse()).toMatchObject({ code: 'FUERA_DE_ALCANCE', detail: { ids: [20] } });
        }
    });
});
