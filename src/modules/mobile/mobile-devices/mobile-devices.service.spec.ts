jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { ConflictException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

const USUARIO_AUTO = 'AUTO (MOBILE_DEVICES_AUTO_APPROVE)';
const MENSAJE_APROBADO = 'Tu dispositivo ya está autorizado. Puedes registrar tu asistencia.';

describe('MobileDevicesService', () => {
    let service: MobileDevicesService;
    let autoApprove: boolean | string | undefined;
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

    const configService = () =>
        ({
            get: (key: string, defaultValue?: string) => {
                if (key !== 'MOBILE_DEVICES_AUTO_APPROVE') {
                    return defaultValue;
                }
                return autoApprove === undefined ? defaultValue : autoApprove;
            },
        }) as unknown as ConfigService;

    const buildService = () =>
        new MobileDevicesService(prisma as unknown as PrismaService, configService());

    beforeEach(() => {
        autoApprove = 'false';
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

        service = buildService();
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
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it.each([true, 'true'])(
            'bandera %p: un dispositivo nuevo nace APROBADO y deja histórico',
            async (flag) => {
                autoApprove = flag;
                service = buildService();

                const tx = {
                    dispositivosAsistencia: {
                        create: jest.fn().mockResolvedValue({
                            idDispositivo: 15,
                            estatus: APROBADO,
                        }),
                    },
                    historicoMovimientos: { create: jest.fn().mockResolvedValue({}) },
                };
                prisma.dispositivosAsistencia.findUnique.mockResolvedValue(null);
                prisma.$transaction.mockImplementation(async (callback) => callback(tx));

                const result = await service.register(userMovil, {
                    identificadorDispositivo: 'device-abc-123',
                    plataforma: 'android',
                    modelo: 'Pixel 8',
                });

                expect(tx.dispositivosAsistencia.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        data: expect.objectContaining({
                            idTenant: 3,
                            idEmpresa: 9,
                            idEmpleado: 42,
                            identificadorDispositivo: 'device-abc-123',
                            estatus: APROBADO,
                            usuarioAprobacion: USUARIO_AUTO,
                            fechaAprobacion: expect.any(Date),
                        }),
                    }),
                );
                expect(tx.historicoMovimientos.create).toHaveBeenCalledWith({
                    data: expect.objectContaining({
                        idUsuario: userMovil.id,
                        idEmpresa: userMovil.idEmpresa,
                        accion: 'APROBAR_AUTOMATICO',
                        tablaOrigen: 'DispositivosAsistencia',
                        idRegistro: '15',
                        descripcion:
                            'Dispositivo 15 aprobado automáticamente (MOBILE_DEVICES_AUTO_APPROVE)',
                        detalles_json: {
                            identificadorDispositivo: 'device-abc-123',
                            plataforma: 'android',
                            modelo: 'Pixel 8',
                        },
                    }),
                });
                expect(prisma.dispositivosAsistencia.create).not.toHaveBeenCalled();
                expect(result).toEqual({
                    idDispositivo: 15,
                    estatus: APROBADO,
                    requiereAprobacion: false,
                    mensaje: MENSAJE_APROBADO,
                });
            },
        );

        it('bandera encendida: un PENDIENTE del mismo empleado pasa a APROBADO', async () => {
            autoApprove = true;
            service = buildService();

            const tx = {
                dispositivosAsistencia: {
                    update: jest.fn().mockResolvedValue({
                        idDispositivo: 8,
                        estatus: APROBADO,
                    }),
                },
                historicoMovimientos: { create: jest.fn().mockResolvedValue({}) },
            };
            prisma.dispositivosAsistencia.findUnique.mockResolvedValue({
                idDispositivo: 8,
                idEmpleado: 42,
                modelo: 'Pixel 7',
                versionApp: '1.0.0',
                pushToken: 'old-token',
                estatus: PENDIENTE,
            });
            prisma.$transaction.mockImplementation(async (callback) => callback(tx));

            const result = await service.register(userMovil, {
                identificadorDispositivo: 'device-abc-123',
                plataforma: 'android',
                modelo: 'Pixel 8',
            });

            expect(tx.dispositivosAsistencia.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { idDispositivo: 8 },
                    data: expect.objectContaining({
                        modelo: 'Pixel 8',
                        estatus: APROBADO,
                        usuarioAprobacion: USUARIO_AUTO,
                        fechaAprobacion: expect.any(Date),
                    }),
                }),
            );
            expect(tx.historicoMovimientos.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    idUsuario: 7,
                    idEmpresa: 9,
                    accion: 'APROBAR_AUTOMATICO',
                    idRegistro: '8',
                    descripcion: 'Dispositivo 8 aprobado automáticamente (MOBILE_DEVICES_AUTO_APPROVE)',
                    detalles_json: {
                        identificadorDispositivo: 'device-abc-123',
                        plataforma: 'android',
                        modelo: 'Pixel 8',
                    },
                }),
            });
            expect(prisma.dispositivosAsistencia.update).not.toHaveBeenCalled();
            expect(result).toEqual({
                idDispositivo: 8,
                estatus: APROBADO,
                requiereAprobacion: false,
                mensaje: MENSAJE_APROBADO,
            });
        });

        it.each(['BLOQUEADO', 'BAJA'])(
            'bandera encendida: un dispositivo %s del mismo empleado no cambia de estatus',
            async (estatus) => {
                autoApprove = true;
                service = buildService();
                prisma.dispositivosAsistencia.findUnique.mockResolvedValue({
                    idDispositivo: 8,
                    idEmpleado: 42,
                    modelo: 'Pixel 7',
                    versionApp: '1.0.0',
                    pushToken: 'old-token',
                    estatus,
                });
                prisma.dispositivosAsistencia.update.mockResolvedValue({
                    idDispositivo: 8,
                    estatus,
                });

                const result = await service.register(userMovil, {
                    identificadorDispositivo: 'device-abc-123',
                    modelo: 'Pixel 8',
                });

                const data = prisma.dispositivosAsistencia.update.mock.calls[0][0].data;
                expect(data).not.toHaveProperty('estatus');
                expect(data).not.toHaveProperty('fechaAprobacion');
                expect(data).not.toHaveProperty('usuarioAprobacion');
                expect(prisma.$transaction).not.toHaveBeenCalled();
                expect(prisma.historicoMovimientos.create).not.toHaveBeenCalled();
                expect(result.estatus).toBe(estatus);
                expect(result.requiereAprobacion).toBe(false);
            },
        );

        it('bandera encendida: un dispositivo de otro empleado sigue respondiendo 409', async () => {
            autoApprove = true;
            service = buildService();
            prisma.dispositivosAsistencia.findUnique.mockResolvedValue({
                idDispositivo: 8,
                idEmpleado: 99,
                idTenant: 3,
                estatus: PENDIENTE,
            });

            await expect(
                service.register(userMovil, { identificadorDispositivo: 'device-abc-123' }),
            ).rejects.toBeInstanceOf(ConflictException);

            await expect(
                service.register(userMovil, { identificadorDispositivo: 'device-abc-123' }),
            ).rejects.toThrow('Este dispositivo ya está vinculado a otro colaborador.');

            expect(prisma.dispositivosAsistencia.create).not.toHaveBeenCalled();
            expect(prisma.dispositivosAsistencia.update).not.toHaveBeenCalled();
            expect(prisma.$transaction).not.toHaveBeenCalled();
            expect(prisma.historicoMovimientos.create).not.toHaveBeenCalled();
        });

        it.each([false, 'false', 'TRUE', '1', 'yes', 0, ''])(
            'el valor %p no activa la aprobación automática',
            async (flag) => {
                autoApprove = flag as boolean | string;
                service = buildService();
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
                        data: expect.objectContaining({ estatus: PENDIENTE }),
                    }),
                );
                expect(prisma.$transaction).not.toHaveBeenCalled();
                expect(result.estatus).toBe(PENDIENTE);
                expect(result.requiereAprobacion).toBe(true);
            },
        );

        it('sin la variable, un dispositivo nuevo sigue naciendo PENDIENTE', async () => {
            autoApprove = undefined;
            service = buildService();
            prisma.dispositivosAsistencia.findUnique.mockResolvedValue(null);
            prisma.dispositivosAsistencia.create.mockResolvedValue({
                idDispositivo: 15,
                estatus: PENDIENTE,
            });

            const result = await service.register(userMovil, {
                identificadorDispositivo: 'device-abc-123',
            });

            expect(result.estatus).toBe(PENDIENTE);
            expect(result.requiereAprobacion).toBe(true);
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });
    });

    describe('onModuleInit', () => {
        it('avisa al arrancar cuando la bandera está activa', () => {
            autoApprove = true;
            service = buildService();
            const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

            service.onModuleInit();

            expect(warn).toHaveBeenCalledWith(
                'MOBILE_DEVICES_AUTO_APPROVE está activo: los dispositivos móviles nuevos se aprueban sin revisión de RH.',
            );
            warn.mockRestore();
        });

        it('no avisa al arrancar cuando la bandera está apagada', () => {
            const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

            service.onModuleInit();

            expect(warn).not.toHaveBeenCalled();
            warn.mockRestore();
        });
    });
});
