jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { MobileDevicesService, MobileDeviceUser } from './mobile-devices.service';

const PENDIENTE = 'PENDIENTE';
const APROBADO = 'APROBADO';

const userMovil: MobileDeviceUser = {
    id: 7,
    uuid: 'user-uuid',
    idTenant: 3,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'Lopez',
    email: 'ana@example.com',
    idEmpleado: 42,
    idEmpresa: 9,
};

describe('MobileDevicesService', () => {
    let service: MobileDevicesService;
    let prisma: {
        dispositivosAsistencia: {
            findUnique: jest.Mock;
            findFirst: jest.Mock;
            findMany: jest.Mock;
            count: jest.Mock;
            create: jest.Mock;
            update: jest.Mock;
        };
        historicoMovimientos: { create: jest.Mock };
        $transaction: jest.Mock;
    };

    beforeEach(() => {
        prisma = {
            dispositivosAsistencia: {
                findUnique: jest.fn(),
                findFirst: jest.fn(),
                findMany: jest.fn(),
                count: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
            },
            historicoMovimientos: { create: jest.fn() },
            $transaction: jest.fn(),
        };

        service = new MobileDevicesService(prisma as unknown as PrismaService);
    });

    describe('register', () => {
        it('un dispositivo nuevo nace PENDIENTE y requiere aprobación', async () => {
            prisma.dispositivosAsistencia.findUnique.mockResolvedValue(null);
            prisma.dispositivosAsistencia.create.mockResolvedValue({
                idDispositivo: 15,
                estatus: PENDIENTE,
            });

            const result = await service.register(userMovil, {
                identificadorDispositivo: 'device-abc-123',
                plataforma: 'android',
            });

            expect(prisma.dispositivosAsistencia.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        idTenant: 3,
                        idEmpresa: 9,
                        idEmpleado: 42,
                        identificadorDispositivo: 'device-abc-123',
                        estatus: PENDIENTE,
                    }),
                }),
            );
            expect(result).toEqual({
                idDispositivo: 15,
                estatus: PENDIENTE,
                requiereAprobacion: true,
                mensaje:
                    'Tu dispositivo quedó registrado y está esperando autorización de Recursos Humanos. Te avisaremos en cuanto puedas registrar tu asistencia.',
            });
        });

        it('responde 409 si el identificador ya pertenece a otro empleado del mismo tenant', async () => {
            prisma.dispositivosAsistencia.findUnique.mockResolvedValue({
                idDispositivo: 8,
                idEmpleado: 99,
                idTenant: 3,
            });

            await expect(
                service.register(userMovil, { identificadorDispositivo: 'device-abc-123' }),
            ).rejects.toBeInstanceOf(ConflictException);

            await expect(
                service.register(userMovil, { identificadorDispositivo: 'device-abc-123' }),
            ).rejects.toThrow('Este dispositivo ya está vinculado a otro colaborador.');

            expect(prisma.dispositivosAsistencia.create).not.toHaveBeenCalled();
            expect(prisma.dispositivosAsistencia.update).not.toHaveBeenCalled();
        });

        it('actualiza datos del mismo empleado sin cambiar el estatus', async () => {
            prisma.dispositivosAsistencia.findUnique.mockResolvedValue({
                idDispositivo: 8,
                idEmpleado: 42,
                modelo: 'Pixel 7',
                versionApp: '1.0.0',
                pushToken: 'old-token',
                estatus: APROBADO,
            });
            prisma.dispositivosAsistencia.update.mockResolvedValue({
                idDispositivo: 8,
                estatus: APROBADO,
            });

            const result = await service.register(userMovil, {
                identificadorDispositivo: 'device-abc-123',
                modelo: 'Pixel 8',
                versionApp: '1.4.0',
                pushToken: 'new-token',
            });

            expect(prisma.dispositivosAsistencia.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { idDispositivo: 8 },
                    data: expect.objectContaining({
                        modelo: 'Pixel 8',
                        versionApp: '1.4.0',
                        pushToken: 'new-token',
                    }),
                }),
            );
            expect(result.estatus).toBe(APROBADO);
            expect(result.requiereAprobacion).toBe(false);
        });
    });
});
