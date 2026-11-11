jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { createHash } from 'crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { AttendanceTrackingConfigService } from '../config/attendance-config/attendance-config.service';
import { DEFAULT_ATTENDANCE_CONFIG } from '../config/attendance-config/interfaces/attendance-config.interface';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { KiosksService } from './kiosks.service';

const user: ActiveUserDto = {
    id: 7,
    uuid: 'user-uuid',
    idTenant: 3,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'López',
    email: 'ana@example.com',
};

const politicas = {
    requiereFoto: false,
    deteccionRostro: false,
    permitirOffline: true,
    aceptarNoIdentificados: true,
};

function detalle(parcial: Record<string, unknown> = {}) {
    return {
        idKiosco: 5,
        idTenant: 3,
        idEmpresa: 9,
        nombre: 'Recepción',
        codigo: 'KSK-A82F91C4',
        modalidad: 'FIJO',
        estatus: 'ACTIVO',
        idEmpleadoResponsable: 4,
        identificadorDispositivo: 'tablet-1',
        ultimoLatido: null,
        versionApp: '1.0.0',
        pendientesReportados: 0,
        politicas,
        fechaActivacion: null,
        plataforma: 'android',
        modelo: 'Tab A',
        tokenJti: 'jti-1',
        Empleados: {
            idEmpleado: 4,
            numeroEmpleado: '100',
            nombre: 'Luis',
            primerApellido: 'Paz',
            segundoApellido: null,
            activo: true,
            CatPuestos: { idPuesto: 1, DescripcionPuesto: 'Jefe' },
        },
        KioscoSites: [],
        ...parcial,
    };
}

describe('KiosksService', () => {
    let service: KiosksService;
    let prisma: {
        kioscosAsistencia: {
            findFirst: jest.Mock;
            findMany: jest.Mock;
            count: jest.Mock;
        };
        registrosAsistencia: { count: jest.Mock };
        registrosKioscoPorIdentificar: { count: jest.Mock };
        $transaction: jest.Mock;
    };
    let tx: {
        kioscosAsistencia: {
            findFirst: jest.Mock;
            update: jest.Mock;
        };
        kioscoCodigosActivacion: {
            updateMany: jest.Mock;
            create: jest.Mock;
        };
        kioscoSites: {
            deleteMany: jest.Mock;
            createMany: jest.Mock;
        };
        empleados: { findFirst: jest.Mock };
        catSites: { findMany: jest.Mock };
        historicoMovimientos: { create: jest.Mock };
    };

    beforeEach(() => {
        tx = {
            kioscosAsistencia: {
                findFirst: jest.fn(),
                update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => detalle(data)),
            },
            kioscoCodigosActivacion: {
                updateMany: jest.fn(async () => ({ count: 1 })),
                create: jest.fn(async () => ({ idCodigo: 9 })),
            },
            kioscoSites: {
                deleteMany: jest.fn(async () => ({ count: 0 })),
                createMany: jest.fn(async () => ({ count: 0 })),
            },
            empleados: { findFirst: jest.fn() },
            catSites: { findMany: jest.fn() },
            historicoMovimientos: { create: jest.fn(async () => ({})) },
        };

        prisma = {
            kioscosAsistencia: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
                count: jest.fn(),
            },
            registrosAsistencia: { count: jest.fn() },
            registrosKioscoPorIdentificar: { count: jest.fn() },
            $transaction: jest.fn(async (arg: unknown) => {
                if (typeof arg === 'function') {
                    return (arg as (cliente: typeof tx) => Promise<unknown>)(tx);
                }
                if (Array.isArray(arg)) return Promise.all(arg);
                return arg;
            }),
        };

        const attendanceConfig = {
            getConfiguracionAsistencia: jest.fn(async () => DEFAULT_ATTENDANCE_CONFIG),
        };
        const configService = {
            get: jest.fn((key: string) => (key === 'KIOSK_MIN_APP_VERSION' ? '1.0.0' : undefined)),
        };

        service = new KiosksService(
            prisma as unknown as PrismaService,
            attendanceConfig as unknown as AttendanceTrackingConfigService,
            configService as unknown as ConfigService,
        );
    });

    describe('regenerateActivationCode', () => {
        it('invalida el código vigente y guarda solo el hash del nuevo', async () => {
            tx.kioscosAsistencia.findFirst.mockResolvedValue(detalle({
                estatus: 'PENDIENTE_ACTIVACION',
            }));
            tx.kioscoCodigosActivacion.updateMany.mockImplementation(async (args) => {
                expect(args.where).toEqual(expect.objectContaining({
                    idKiosco: 5,
                    usadoEn: null,
                    invalidadoEn: null,
                }));
                expect(args.where.expiraEn).toEqual({ gt: expect.any(Date) });
                expect(args.data.invalidadoEn).toEqual(expect.any(Date));
                return { count: 1 };
            });

            const result = await service.regenerateActivationCode(user, 9, 5);

            expect(result.codigo).toMatch(/^[0-9A-F]{32}$/);
            expect(result.vigenciaHoras).toBe(24);
            expect(result.expiraEn.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);

            const guardado = tx.kioscoCodigosActivacion.create.mock.calls[0][0].data;
            expect(guardado.codigoHash).toBe(createHash('sha256').update(result.codigo).digest('hex'));
            expect(guardado.codigoHash).not.toBe(result.codigo);
            expect(guardado.usadoEn).toBeNull();
            expect(guardado.intentosFallidos).toBe(0);
            expect(tx.historicoMovimientos.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    accion: 'REGENERAR_CODIGO',
                    tablaOrigen: 'KioscosAsistencia',
                    idRegistro: '5',
                    idEmpresa: 9,
                    idUsuario: 7,
                }),
            });
        });

        it('responde 409 si el kiosco está activo', async () => {
            tx.kioscosAsistencia.findFirst.mockResolvedValue(detalle({ estatus: 'ACTIVO' }));

            await expect(service.regenerateActivationCode(user, 9, 5)).rejects.toBeInstanceOf(ConflictException);
            expect(tx.kioscoCodigosActivacion.updateMany).not.toHaveBeenCalled();
            expect(tx.kioscoCodigosActivacion.create).not.toHaveBeenCalled();
        });
    });

    describe('blockKiosk', () => {
        it('deja el kiosco bloqueado y limpia tokenJti', async () => {
            tx.kioscosAsistencia.findFirst.mockResolvedValue(detalle({
                estatus: 'ACTIVO',
                tokenJti: 'jti-activo',
            }));

            const result = await service.blockKiosk(user, 9, 5);

            expect(tx.kioscosAsistencia.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { idKiosco: 5 },
                data: expect.objectContaining({
                    estatus: 'BLOQUEADO',
                    tokenJti: null,
                }),
            }));
            expect(result.kiosk.estatus).toBe('BLOQUEADO');
            expect(tx.historicoMovimientos.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ accion: 'BLOQUEAR', tablaOrigen: 'KioscosAsistencia' }),
            });
        });
    });

    describe('retireKiosk', () => {
        it('da de baja el kiosco y limpia tokenJti', async () => {
            tx.kioscosAsistencia.findFirst.mockResolvedValue(detalle({
                estatus: 'ACTIVO',
                tokenJti: 'jti-activo',
            }));

            const result = await service.retireKiosk(user, 9, 5);

            expect(tx.kioscosAsistencia.update).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    estatus: 'BAJA',
                    tokenJti: null,
                    fechaBaja: expect.any(Date),
                }),
            }));
            expect(result.kiosk.estatus).toBe('BAJA');
            expect(tx.historicoMovimientos.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ accion: 'BAJA', tablaOrigen: 'KioscosAsistencia' }),
            });
        });
    });

    describe('unblockKiosk', () => {
        it('regresa a pendiente de activación y limpia el identificador del equipo', async () => {
            tx.kioscosAsistencia.findFirst.mockResolvedValue(detalle({
                estatus: 'BLOQUEADO',
                identificadorDispositivo: 'tablet-1',
            }));

            const result = await service.unblockKiosk(user, 9, 5);

            expect(tx.kioscosAsistencia.update).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    estatus: 'PENDIENTE_ACTIVACION',
                    identificadorDispositivo: null,
                }),
            }));
            expect(result.kiosk.dispositivo.identificador).toBeNull();
            expect(result.kiosk.dispositivo.vinculado).toBe(false);
            expect(tx.historicoMovimientos.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ accion: 'DESBLOQUEAR' }),
            });
        });
    });

    describe('updateKiosk', () => {
        it('responde 400 si la detección de rostro no exige fotografía', async () => {
            tx.kioscosAsistencia.findFirst.mockResolvedValue(detalle({
                estatus: 'ACTIVO',
                modalidad: 'FIJO',
                nombre: 'Recepción',
                KioscoSites: [{ idSite: 2 }],
                politicas: {
                    requiereFoto: true,
                    deteccionRostro: false,
                    permitirOffline: false,
                    aceptarNoIdentificados: false,
                },
            }));

            await expect(service.updateKiosk(user, 9, 5, {
                politicas: {
                    requiereFoto: false,
                    deteccionRostro: true,
                    permitirOffline: false,
                    aceptarNoIdentificados: false,
                },
            })).rejects.toThrow(BadRequestException);

            await expect(service.updateKiosk(user, 9, 5, {
                politicas: {
                    requiereFoto: false,
                    deteccionRostro: true,
                    permitirOffline: false,
                    aceptarNoIdentificados: false,
                },
            })).rejects.toThrow('La detección de rostro requiere que la captura de fotografía esté habilitada.');

            expect(tx.kioscosAsistencia.update).not.toHaveBeenCalled();
        });
    });

    describe('findOne', () => {
        it('responde 404 si el kiosco pertenece a otro tenant', async () => {
            prisma.kioscosAsistencia.findFirst.mockResolvedValue(null);

            await expect(service.findOne(user, 9, 5)).rejects.toBeInstanceOf(NotFoundException);
            expect(prisma.kioscosAsistencia.findFirst).toHaveBeenCalledWith({
                where: { idKiosco: 5, idTenant: 3, idEmpresa: 9 },
                select: expect.any(Object),
            });
        });
    });

    describe('findAll', () => {
        it('soloAlertas deja fuera al kiosco en línea, al día y sin pendientes', async () => {
            const ahora = new Date();
            const haceDosHoras = new Date(ahora.getTime() - 2 * 60 * 60 * 1000);
            const fila = (parcial: Record<string, unknown>) => detalle({
                Empleados: detalle().Empleados,
                KioscoSites: [],
                ...parcial,
            });

            prisma.kioscosAsistencia.findMany.mockResolvedValue([
                fila({ idKiosco: 1, ultimoLatido: haceDosHoras, versionApp: '1.0.0', pendientesReportados: 0 }),
                fila({ idKiosco: 2, ultimoLatido: ahora, versionApp: '1.0.0', pendientesReportados: 0 }),
                fila({ idKiosco: 3, ultimoLatido: ahora, versionApp: '1.0.0', pendientesReportados: 3 }),
                fila({ idKiosco: 4, ultimoLatido: ahora, versionApp: '0.9.0', pendientesReportados: 0 }),
                fila({ idKiosco: 5, ultimoLatido: null, versionApp: null, pendientesReportados: 0 }),
            ]);

            const result = await service.findAll(user, 9, { soloAlertas: true, page: 1, limit: 10 });

            expect(result.kiosks.map((kiosk) => kiosk.idKiosco)).toEqual([1, 3, 4]);
            expect(result.kiosks[0].conexion).toBe('SIN_CONEXION');
            expect(result.pagination.total).toBe(3);
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });
    });
});
