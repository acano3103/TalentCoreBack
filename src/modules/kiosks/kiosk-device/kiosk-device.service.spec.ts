jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { Logger } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { AttendanceEngineService } from 'src/modules/attendance/engine/attendance-engine.service';
import { DEFAULT_ATTENDANCE_CONFIG } from 'src/modules/config/attendance-config/interfaces/attendance-config.interface';
import { AttendanceTrackingConfigService } from 'src/modules/config/attendance-config/attendance-config.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { SesionKiosco } from '../kiosk-auth/kiosco-actual';
import { KioskJwtAuthGuard } from '../kiosk-auth/guards/kiosk-jwt-auth.guard';
import { KioskDeviceController } from './kiosk-device.controller';
import { KioskDeviceService } from './kiosk-device.service';

const kiosco: SesionKiosco = {
    tipo: 'KIOSCO',
    idKiosco: 5,
    idTenant: 3,
    idEmpresa: 9,
    codigo: 'KSK-A82F91C4',
    nombre: 'Recepción',
    modalidad: 'FIJO',
    jti: 'jti-1',
};

const contexto = {
    zonaHoraria: 'America/Mexico_City',
    fechaJornada: new Date('2026-11-11T00:00:00.000Z'),
    fechaLocal: '2026-11-11',
    diaSemana: 'Miércoles',
    horario: {
        HoraEntrada: new Date('1970-01-01T08:00:00.000Z'),
        HoraSalida: new Date('1970-01-01T17:00:00.000Z'),
    },
    config: DEFAULT_ATTENDANCE_CONFIG,
};

describe('KioskDeviceService', () => {
    let service: KioskDeviceService;
    let prisma: {
        kioscosAsistencia: { findUnique: jest.Mock; update: jest.Mock };
        kioscoSites: { findMany: jest.Mock };
        empleados: { findMany: jest.Mock; findFirst: jest.Mock };
        relEmpleadosSites: { findMany: jest.Mock; findFirst: jest.Mock };
        catEmpresas: { findUnique: jest.Mock };
        historicoMovimientos: { create: jest.Mock };
    };
    let engine: { resolveContext: jest.Mock; resolveNextType: jest.Mock };
    let warn: jest.SpyInstance;

    beforeEach(() => {
        prisma = {
            kioscosAsistencia: {
                findUnique: jest.fn(),
                update: jest.fn(async () => ({})),
            },
            kioscoSites: { findMany: jest.fn(async () => [{ idSite: 10 }, { idSite: 20 }]) },
            empleados: { findMany: jest.fn(), findFirst: jest.fn() },
            relEmpleadosSites: { findMany: jest.fn(), findFirst: jest.fn() },
            catEmpresas: {
                findUnique: jest.fn(async () => ({
                    nombre_comercial: 'DataVoice',
                    razon_social: 'DataVoice SA',
                })),
            },
            historicoMovimientos: { create: jest.fn() },
        };
        engine = {
            resolveContext: jest.fn(async () => contexto),
            resolveNextType: jest.fn(async () => ({
                sugerido: 'ENTRADA',
                permitidos: ['ENTRADA'],
                ultimoTipo: null,
            })),
        };
        const config = {
            get: jest.fn((key: string) => (key === 'KIOSK_MIN_APP_VERSION' ? undefined : undefined)),
        };
        const attendance = {
            getConfiguracionAsistencia: jest.fn(async () => DEFAULT_ATTENDANCE_CONFIG),
        };

        service = new KioskDeviceService(
            prisma as unknown as PrismaService,
            attendance as unknown as AttendanceTrackingConfigService,
            engine as unknown as AttendanceEngineService,
            config as unknown as ConfigService,
        );
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        warn.mockRestore();
    });

    function padrónDeDosSites() {
        prisma.empleados.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) => {
            if (args.where.idSite) {
                return [
                    {
                        idEmpleado: 1,
                        numeroEmpleado: '100',
                        nombre: 'Ana',
                        primerApellido: 'Ruiz',
                        curp: 'NO-DEBE-SALIR',
                        rfc: 'NO-DEBE-SALIR',
                        numeroSeguroSocial: 'NO-DEBE-SALIR',
                    },
                    {
                        idEmpleado: 3,
                        numeroEmpleado: '   ',
                        nombre: 'Sin',
                        primerApellido: 'Número',
                    },
                ];
            }
            return [
                {
                    idEmpleado: 2,
                    numeroEmpleado: '200',
                    nombre: 'Luis',
                    primerApellido: 'Paz',
                },
            ];
        });
        prisma.relEmpleadosSites.findMany.mockResolvedValue([{ idEmpleado: 2 }, { idEmpleado: 1 }]);
    }

    it('arma el padrón con los empleados de los dos sites y omite datos sensibles', async () => {
        padrónDeDosSites();

        const result = await service.roster(kiosco);

        expect(prisma.kioscoSites.findMany).toHaveBeenCalledWith({
            where: { idKiosco: 5 },
            select: { idSite: true },
        });
        expect(prisma.empleados.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                idTenant: 3,
                activo: true,
                idSite: { in: [10, 20] },
            }),
            select: {
                idEmpleado: true,
                numeroEmpleado: true,
                nombre: true,
                primerApellido: true,
            },
        }));
        expect(prisma.relEmpleadosSites.findMany).toHaveBeenCalledWith({
            where: { Activo: true, idSite: { in: [10, 20] } },
            select: { idEmpleado: true },
        });
        expect(result.sinCambios).toBe(false);
        if (!result.sinCambios) {
            expect(result.empleados).toEqual([
                { idEmpleado: 1, numeroEmpleado: '100', nombreCorto: 'Ana Ruiz', iniciales: 'AR' },
                { idEmpleado: 2, numeroEmpleado: '200', nombreCorto: 'Luis Paz', iniciales: 'LP' },
            ]);
            expect(Object.keys(result.empleados[0]).sort()).toEqual([
                'idEmpleado',
                'iniciales',
                'nombreCorto',
                'numeroEmpleado',
            ]);
            expect(JSON.stringify(result)).not.toMatch(/curp|rfc|numeroSeguroSocial|foto/i);
        }
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('numeroEmpleado'));
    });

    it('responde sinCambios cuando la versión del equipo sigue vigente', async () => {
        padrónDeDosSites();

        const primero = await service.roster(kiosco);
        const consultas = prisma.empleados.findMany.mock.calls.length;
        const segundo = await service.roster(kiosco, primero.version);

        expect(segundo).toEqual({ version: primero.version, sinCambios: true });
        expect(segundo).not.toHaveProperty('empleados');
        expect(prisma.empleados.findMany).toHaveBeenCalledTimes(consultas);
    });

    describe('lookup', () => {
        it('no encuentra el número en el tenant', async () => {
            prisma.empleados.findFirst.mockResolvedValue(null);

            const error = await service.lookup(kiosco, '999').catch((e) => e);

            expect(error.getStatus()).toBe(404);
            expect(error.getResponse()).toEqual({
                code: 'EMPLEADO_NO_ENCONTRADO',
                message: expect.any(String),
            });
            expect(engine.resolveNextType).not.toHaveBeenCalled();
        });

        it('rechaza un empleado inactivo sin devolver sus datos', async () => {
            prisma.empleados.findFirst.mockResolvedValue({
                idEmpleado: 8,
                numeroEmpleado: '100',
                nombre: 'Ana',
                primerApellido: 'Ruiz',
                activo: false,
                idSite: 10,
            });

            const error = await service.lookup(kiosco, '100').catch((e) => e);

            expect(error.getStatus()).toBe(409);
            expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'EMPLEADO_INACTIVO' }));
            expect(JSON.stringify(error.getResponse())).not.toMatch(/Ana|Ruiz|100/);
            expect(engine.resolveContext).not.toHaveBeenCalled();
        });

        it('rechaza a quien está activo pero fuera del padrón', async () => {
            prisma.empleados.findFirst.mockResolvedValue({
                idEmpleado: 8,
                numeroEmpleado: '100',
                nombre: 'Ana',
                primerApellido: 'Ruiz',
                activo: true,
                idSite: 99,
            });
            prisma.relEmpleadosSites.findFirst.mockResolvedValue(null);

            const error = await service.lookup(kiosco, '100').catch((e) => e);

            expect(error.getStatus()).toBe(409);
            expect(error.getResponse()).toEqual({
                code: 'EMPLEADO_NO_ASIGNADO',
                message: 'No estás asignado a esta ubicación.',
            });
        });

        it('devuelve el tipo sugerido y el turno de hoy si está en el padrón', async () => {
            prisma.empleados.findFirst.mockResolvedValue({
                idEmpleado: 8,
                numeroEmpleado: '100',
                nombre: 'Ana',
                primerApellido: 'Ruiz',
                activo: true,
                idSite: 10,
            });

            const result = await service.lookup(kiosco, '100');

            expect(engine.resolveNextType).toHaveBeenCalledWith(
                8,
                contexto.fechaJornada,
                DEFAULT_ATTENDANCE_CONFIG,
                'SECUENCIA_COMPLETA',
            );
            expect(result).toEqual({
                idEmpleado: 8,
                numeroEmpleado: '100',
                nombreCorto: 'Ana Ruiz',
                iniciales: 'AR',
                tipoSugerido: 'ENTRADA',
                turnoHoy: {
                    fecha: '2026-11-11',
                    diaSemana: 'Miércoles',
                    zonaHoraria: 'America/Mexico_City',
                    entrada: '08:00:00',
                    salida: '17:00:00',
                },
            });
        });
    });

    it('el latido actualiza la telemetría y no escribe histórico', async () => {
        padrónDeDosSites();

        const result = await service.heartbeat(kiosco, {
            pendientes: 3,
            versionApp: '0.2.0',
            ultimaSync: '2026-11-11T18:00:00.000Z',
        });

        expect(prisma.kioscosAsistencia.update).toHaveBeenCalledWith({
            where: { idKiosco: 5 },
            data: expect.objectContaining({
                ultimoLatido: expect.any(Date),
                pendientesReportados: 3,
                versionApp: '0.2.0',
            }),
        });
        expect(prisma.historicoMovimientos.create).not.toHaveBeenCalled();
        expect(result.versionMinimaApp).toBe('0.1.0');
        expect(result.padronVersion).toEqual(expect.any(String));
        expect(result.servidor.fechaHora).toEqual(expect.any(String));
    });
});

describe('KioskDeviceController', () => {
    it('protege el arranque, el padrón, la búsqueda, el latido y las checadas con el token del kiosco', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, KioskDeviceController)).toContain(KioskJwtAuthGuard);
        expect(KioskDeviceController.prototype.evidence).toEqual(expect.any(Function));
        expect(KioskDeviceController.prototype.check).toEqual(expect.any(Function));
        expect(KioskDeviceController.prototype.sync).toEqual(expect.any(Function));
    });
});
