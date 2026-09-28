jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { BadRequestException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { AttendanceEngineService } from 'src/modules/attendance/engine/attendance-engine.service';
import { DEFAULT_ATTENDANCE_CONFIG } from 'src/modules/config/attendance-config/interfaces/attendance-config.interface';
import { AttendanceTrackingConfigService } from 'src/modules/config/attendance-config/attendance-config.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { mapJornadaConMarcajes } from 'src/modules/attendance/utils/jornada-response.util';
import { MobileJwtAuthGuard } from '../mobile-auth/guards/mobile-jwt-auth.guard';
import { HistoryQueryDto } from './dto/history-query.dto';
import { MobileAttendanceController } from './mobile-attendance.controller';
import { MobileAttendanceService, MobileAttendanceUser } from './mobile-attendance.service';

const INSTANTE = new Date('2026-09-28T06:30:00.000Z');
const FECHA_LOCAL = '2026-09-27';

const userMovil: MobileAttendanceUser = {
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

describe('MobileAttendanceService', () => {
    let service: MobileAttendanceService;
    let engine: AttendanceEngineService;
    let configService: { get: jest.Mock };
    let prisma: {
        empleados: { findUnique: jest.Mock; findFirst: jest.Mock };
        relEmpleadosSites: { findFirst: jest.Mock; findMany: jest.Mock };
        catSites: { findUnique: jest.Mock };
        horariosEmpleado: { findFirst: jest.Mock; findMany: jest.Mock };
        registrosAsistencia: { findFirst: jest.Mock; findMany: jest.Mock };
        jornadasEmpleado: { findFirst: jest.Mock; findMany: jest.Mock };
        dispositivosAsistencia: { findFirst: jest.Mock };
        configuracionJornadaLegal: { findFirst: jest.Mock };
    };

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(INSTANTE);

        prisma = {
            empleados: {
                findUnique: jest.fn(async () => ({
                    idEmpleado: 42,
                    idSite: 3,
                    idTenant: 3,
                    idEmpresa: 9,
                })),
                findFirst: jest.fn(async () => ({
                    idEmpleado: 42,
                    numeroEmpleado: 'E-100',
                    nombre: 'Ana',
                    primerApellido: 'López',
                    segundoApellido: null,
                    CatPuestos: { NombrePuesto: 'Analista' },
                })),
            },
            relEmpleadosSites: {
                findFirst: jest.fn(async ({ where }: { where?: { EsPrincipal?: boolean } }) => {
                    if (!where?.EsPrincipal) return null;
                    return {
                        idSite: 3,
                        CatSites: {
                            zonaHoraria: 'America/Tijuana',
                            Descripcion: 'Sucursal Tijuana',
                        },
                    };
                }),
                findMany: jest.fn(async () => []),
            },
            catSites: {
                findUnique: jest.fn(async () => ({ zonaHoraria: 'America/Tijuana' })),
            },
            horariosEmpleado: {
                findFirst: jest.fn(async () => null),
                findMany: jest.fn(async () => []),
            },
            registrosAsistencia: {
                findFirst: jest.fn(async () => null),
                findMany: jest.fn(async () => []),
            },
            jornadasEmpleado: {
                findFirst: jest.fn(async () => null),
                findMany: jest.fn(async () => []),
            },
            dispositivosAsistencia: {
                findFirst: jest.fn(async () => null),
            },
            configuracionJornadaLegal: {
                findFirst: jest.fn(async () => null),
            },
        };

        const attendanceConfig = {
            getConfiguracionAsistencia: jest.fn(async () =>
                structuredClone(DEFAULT_ATTENDANCE_CONFIG),
            ),
        };
        engine = new AttendanceEngineService(
            prisma as unknown as PrismaService,
            attendanceConfig as unknown as AttendanceTrackingConfigService,
        );
        configService = { get: jest.fn(() => undefined) };
        service = new MobileAttendanceService(
            prisma as unknown as PrismaService,
            engine,
            configService as unknown as ConfigService,
        );
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('serverTime', () => {
        it('devuelve ISO-8601 con offset y el epoch del mismo instante', () => {
            const result = service.serverTime();

            expect(result.epochMs).toBe(INSTANTE.getTime());
            expect(result.serverTime.endsWith('Z')).toBe(false);
            expect(Date.parse(result.serverTime)).toBe(INSTANTE.getTime());
        });
    });

    describe('today', () => {
        it('usa la fecha local del sitio y no la fecha UTC', async () => {
            const result = await service.today(userMovil);

            expect(result.fecha).toBe(FECHA_LOCAL);
            expect(result.diaSemana).toBe('Domingo');
            expect(result.zonaHoraria).toBe('America/Tijuana');
            expect(result.fecha).not.toBe(INSTANTE.toISOString().slice(0, 10));
        });

        it('consulta la semana ISO y el tope legal con la identidad del JWT', async () => {
            prisma.jornadasEmpleado.findMany.mockResolvedValue([
                { minutosTrabajados: 400 },
                { minutosTrabajados: 200 },
            ]);

            const result = await service.today(userMovil);

            expect(prisma.empleados.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { idEmpleado: 42, idEmpresa: 9, idTenant: 3, activo: true },
                }),
            );
            expect(prisma.jornadasEmpleado.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        idEmpleado: 42,
                        idEmpresa: 9,
                        idTenant: 3,
                        fecha: {
                            gte: new Date('2026-09-21T00:00:00.000Z'),
                            lte: new Date('2026-09-27T00:00:00.000Z'),
                        },
                    },
                }),
            );
            expect(prisma.configuracionJornadaLegal.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { idEmpresa: 9, idTenant: 3, anio: 2026, activo: true },
                }),
            );
            expect(result.acumuladoSemana).toEqual({
                minutosTrabajados: 600,
                limiteLegalMinutos: 48 * 60,
                porcentaje: 20.83,
                excedeLimite: false,
            });
        });

        it('usa horasSemana de la configuración legal cuando existe', async () => {
            prisma.configuracionJornadaLegal.findFirst.mockResolvedValue({ horasSemana: 1 });
            prisma.jornadasEmpleado.findMany.mockResolvedValue([{ minutosTrabajados: 90 }]);

            const result = await service.today(userMovil);

            expect(result.acumuladoSemana.limiteLegalMinutos).toBe(60);
            expect(result.acumuladoSemana.excedeLimite).toBe(true);
        });

        it('deja el botón deshabilitado si el dispositivo no está aprobado', async () => {
            prisma.dispositivosAsistencia.findFirst.mockResolvedValue({
                idDispositivo: 15,
                estatus: 'PENDIENTE',
            });

            const result = await service.today(userMovil);

            expect(result.siguienteAccion).toEqual({
                sugerido: 'ENTRADA',
                permitidos: ['ENTRADA'],
                etiqueta: 'Registrar entrada',
                habilitado: false,
                motivoBloqueo: 'El dispositivo no está aprobado para registrar asistencia.',
            });
        });

        it('habilita la acción cuando el dispositivo está aprobado', async () => {
            prisma.dispositivosAsistencia.findFirst.mockResolvedValue({
                idDispositivo: 15,
                estatus: 'APROBADO',
            });

            const result = await service.today(userMovil);

            expect(result.siguienteAccion.habilitado).toBe(true);
            expect(result.siguienteAccion.motivoBloqueo).toBeNull();
            expect(result.siguienteAccion.etiqueta).toBe('Registrar entrada');
        });

        it('prioriza el dispositivo no aprobado aunque ya no haya acciones', async () => {
            prisma.dispositivosAsistencia.findFirst.mockResolvedValue({
                idDispositivo: 15,
                estatus: 'PENDIENTE',
            });
            jest.spyOn(engine, 'resolveNextType').mockResolvedValue({
                sugerido: null,
                permitidos: [],
                ultimoTipo: 'SALIDA',
            });

            const result = await service.today(userMovil);

            expect(result.siguienteAccion.habilitado).toBe(false);
            expect(result.siguienteAccion.motivoBloqueo).toBe(
                'El dispositivo no está aprobado para registrar asistencia.',
            );
        });

        it('explica el bloqueo cuando la jornada ya no admite checadas', async () => {
            prisma.dispositivosAsistencia.findFirst.mockResolvedValue({
                idDispositivo: 15,
                estatus: 'APROBADO',
            });
            jest.spyOn(engine, 'resolveNextType').mockResolvedValue({
                sugerido: null,
                permitidos: [],
                ultimoTipo: 'SALIDA',
            });

            const result = await service.today(userMovil);

            expect(result.siguienteAccion).toMatchObject({
                sugerido: null,
                permitidos: [],
                etiqueta: null,
                habilitado: false,
                motivoBloqueo: 'No hay acciones de checada permitidas para la jornada de hoy.',
            });
        });

        it.each([
            ['ENTRADA', 'Registrar entrada'],
            ['INICIO_COMIDA', 'Salida a comida'],
            ['FIN_COMIDA', 'Regreso de comida'],
            ['SALIDA', 'Registrar salida'],
        ] as const)('etiqueta %s como %s', async (sugerido, etiqueta) => {
            prisma.dispositivosAsistencia.findFirst.mockResolvedValue({
                idDispositivo: 15,
                estatus: 'APROBADO',
            });
            jest.spyOn(engine, 'resolveNextType').mockResolvedValue({
                sugerido,
                permitidos: [sugerido],
                ultimoTipo: null,
            });

            const result = await service.today(userMovil);

            expect(result.siguienteAccion.etiqueta).toBe(etiqueta);
            expect(result.siguienteAccion.habilitado).toBe(true);
        });

        it('devuelve la jornada del día local y si el marcaje tiene evidencia', async () => {
            prisma.jornadasEmpleado.findFirst.mockResolvedValue({
                idJornada: 8,
                estatusJornada: 'ABIERTA',
                horaEntradaTeorica: new Date('1970-01-01T08:00:00.000Z'),
                horaSalidaTeorica: new Date('1970-01-01T17:30:00.000Z'),
                horaEntradaReal: new Date('2026-09-27T15:05:00.000Z'),
                horaSalidaReal: null,
                horaInicioComidaReal: null,
                horaFinComidaReal: null,
                minutosTrabajados: 0,
                minutosRetardo: 5,
                minutosComida: 0,
                revisada: false,
            });
            prisma.registrosAsistencia.findMany.mockResolvedValue([
                {
                    idRegistro: 100n,
                    tipo: 'ENTRADA',
                    canal: 'APP_MOVIL',
                    fechaHoraRegistro: new Date('2026-09-27T15:05:00.000Z'),
                    resultadoGeocerca: 'DENTRO',
                    urlFoto: 'media/selfie.jpg',
                    idEvidencia: 4,
                },
            ]);

            const result = await service.today(userMovil);

            expect(result.jornada).toEqual({
                idJornada: 8,
                estatusJornada: 'ABIERTA',
                horaEntradaTeorica: '08:00:00',
                horaSalidaTeorica: '17:30:00',
                horaEntradaReal: '2026-09-27T15:05:00.000Z',
                horaSalidaReal: null,
                horaInicioComidaReal: null,
                horaFinComidaReal: null,
                minutosTrabajados: 0,
                minutosRetardo: 5,
                minutosComida: 0,
                revisada: false,
            });
            expect(result.registros).toEqual([
                {
                    idRegistro: 100,
                    tipo: 'ENTRADA',
                    canal: 'APP_MOVIL',
                    fechaHoraRegistro: new Date('2026-09-27T15:05:00.000Z'),
                    resultadoGeocerca: 'DENTRO',
                    tieneEvidencia: true,
                },
            ]);
        });

        it('rechaza la sesión sin idEmpleado', async () => {
            await expect(
                service.today({ ...userMovil, idEmpleado: null }),
            ).rejects.toBeInstanceOf(UnauthorizedException);
        });
    });

    describe('bootstrap', () => {
        it('marca puedeRegistrar en false cuando el dispositivo está PENDIENTE', async () => {
            prisma.dispositivosAsistencia.findFirst.mockResolvedValue({
                idDispositivo: 15,
                estatus: 'PENDIENTE',
            });

            const result = await service.bootstrap(userMovil);

            expect(result.dispositivo).toEqual({
                idDispositivo: 15,
                estatus: 'PENDIENTE',
                puedeRegistrar: false,
            });
        });

        it('marca puedeRegistrar en true solo si el estatus es APROBADO', async () => {
            prisma.dispositivosAsistencia.findFirst.mockResolvedValue({
                idDispositivo: 15,
                estatus: 'APROBADO',
            });

            const result = await service.bootstrap(userMovil);

            expect(result.dispositivo?.puedeRegistrar).toBe(true);
        });

        it('devuelve null cuando el colaborador no tiene dispositivo', async () => {
            const result = await service.bootstrap(userMovil);

            expect(result.dispositivo).toBeNull();
        });

        it('arma reglas, geocercas, horario y la versión mínima', async () => {
            configService.get.mockReturnValue('2.4.0');
            prisma.horariosEmpleado.findMany.mockResolvedValue([
                {
                    DiaSemana: 'Domingo',
                    HoraEntrada: new Date('1970-01-01T09:00:00.000Z'),
                    HoraSalida: new Date('1970-01-01T14:00:00.000Z'),
                    Modalidad: 'Presencial',
                },
                {
                    DiaSemana: 'Lunes',
                    HoraEntrada: new Date('1970-01-01T08:00:00.000Z'),
                    HoraSalida: new Date('1970-01-01T17:00:00.000Z'),
                    Modalidad: 'Híbrido',
                },
            ]);
            prisma.relEmpleadosSites.findMany.mockResolvedValue([
                {
                    idEmpleado: 42,
                    idSite: 3,
                    Activo: true,
                    CatSites: {
                        Descripcion: 'Sucursal Tijuana',
                        CatGeocercas: [
                            {
                                idGeocerca: 5,
                                Nombre: 'Acceso',
                                Tipo: 'circle',
                                Latitud: 32.5,
                                Longitud: -117.0,
                                Radio: 80,
                                RelGeocercaVertices: [],
                            },
                            {
                                idGeocerca: 6,
                                Nombre: 'Nave',
                                Tipo: 'polygon',
                                Latitud: 32.51,
                                Longitud: -117.01,
                                Radio: null,
                                RelGeocercaVertices: [
                                    { Latitud: 32.51, Longitud: -117.01 },
                                    { Latitud: 32.52, Longitud: -117.02 },
                                ],
                            },
                        ],
                    },
                },
            ]);

            const result = await service.bootstrap(userMovil);

            expect(prisma.relEmpleadosSites.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        idEmpleado: 42,
                        Activo: true,
                        MetodoAsistencia: { in: ['APP_MOVIL', 'CUALQUIERA'] },
                    },
                }),
            );
            expect(result.empleado).toEqual({
                idEmpleado: 42,
                numeroEmpleado: 'E-100',
                nombreCompleto: 'Ana López',
                puesto: 'Analista',
                sitioPrincipal: 'Sucursal Tijuana',
            });
            expect(result.zonaHoraria).toBe('America/Tijuana');
            expect(result.reglas).toMatchObject({
                minutosToleranciaEntrada: 15,
                selfieObligatoria: true,
                precisionGpsMaximaMetros: 100,
                desfaseRelojMaximoSegundos: 300,
                antiguedadOfflineMaximaHoras: 72,
            });
            expect(result.geocercas).toEqual([
                {
                    idGeocerca: 5,
                    nombre: 'Acceso',
                    tipo: 'circle',
                    latitud: 32.5,
                    longitud: -117,
                    radio: 80,
                    vertices: null,
                    idSite: 3,
                    nombreSite: 'Sucursal Tijuana',
                },
                {
                    idGeocerca: 6,
                    nombre: 'Nave',
                    tipo: 'polygon',
                    latitud: 32.51,
                    longitud: -117.01,
                    radio: null,
                    vertices: [
                        { lat: 32.51, lng: -117.01 },
                        { lat: 32.52, lng: -117.02 },
                    ],
                    idSite: 3,
                    nombreSite: 'Sucursal Tijuana',
                },
            ]);
            expect(result.horarioSemana).toEqual([
                {
                    diaSemana: 'Lunes',
                    horaEntrada: '08:00:00',
                    horaSalida: '17:00:00',
                    modalidad: 'Híbrido',
                },
                {
                    diaSemana: 'Domingo',
                    horaEntrada: '09:00:00',
                    horaSalida: '14:00:00',
                    modalidad: 'Presencial',
                },
            ]);
            expect(result.versionMinimaApp).toBe('2.4.0');
            expect(result.epochMs).toBe(INSTANTE.getTime());
        });

        it('usa 1.0.0 cuando no hay MOBILE_MIN_APP_VERSION', async () => {
            const result = await service.bootstrap(userMovil);

            expect(result.versionMinimaApp).toBe('1.0.0');
        });
    });

    describe('history', () => {
        const jornada = {
            idJornada: 4,
            fecha: new Date('2026-09-21T00:00:00.000Z'),
            estatusJornada: 'CERRADA',
            minutosTrabajados: 480,
            minutosRetardo: 0,
            horaEntradaTeorica: new Date('1970-01-01T08:00:00.000Z'),
            horaSalidaTeorica: new Date('1970-01-01T17:00:00.000Z'),
            horaEntradaReal: new Date('2026-09-21T15:00:00.000Z'),
            horaSalidaReal: new Date('2026-09-21T23:00:00.000Z'),
            RegistrosAsistencia: [
                {
                    idRegistro: 1,
                    tipo: 'ENTRADA',
                    canal: 'APP_MOVIL',
                    fechaHoraRegistro: new Date('2026-09-21T15:00:00.000Z'),
                    resultadoGeocerca: 'DENTRO',
                    nombreDispositivo: 'Pixel',
                },
                {
                    idRegistro: 2,
                    tipo: 'SALIDA',
                    canal: 'APP_MOVIL',
                    fechaHoraRegistro: new Date('2026-09-21T23:00:00.000Z'),
                    resultadoGeocerca: 'DENTRO',
                    nombreDispositivo: 'Pixel',
                },
            ],
        };

        it('reusa el mapeo de jornada y filtra por el empleado del JWT', async () => {
            prisma.jornadasEmpleado.findMany.mockResolvedValue([jornada]);

            const result = await service.history(userMovil, '2026-09-01', '2026-09-27');

            expect(result).toEqual({
                from: '2026-09-01',
                to: '2026-09-27',
                jornadas: [mapJornadaConMarcajes(jornada)],
            });
            expect(prisma.jornadasEmpleado.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        idEmpleado: 42,
                        idTenant: 3,
                        idEmpresa: 9,
                    }),
                }),
            );
        });

        it('por defecto cubre los últimos 30 días locales del sitio', async () => {
            const result = await service.history(userMovil);

            expect(result.from).toBe('2026-08-29');
            expect(result.to).toBe(FECHA_LOCAL);
        });

        it('acepta 90 días inclusivos y rechaza 91', async () => {
            await expect(service.history(userMovil, '2026-01-01', '2026-03-31')).resolves.toMatchObject({
                from: '2026-01-01',
                to: '2026-03-31',
            });

            await expect(service.history(userMovil, '2026-01-01', '2026-04-01')).rejects.toBeInstanceOf(
                BadRequestException,
            );
        });

        it('rechaza un rango invertido o una fecha imposible', async () => {
            await expect(service.history(userMovil, '2026-09-27', '2026-09-01')).rejects.toBeInstanceOf(
                BadRequestException,
            );
            await expect(service.history(userMovil, '2026-02-31', '2026-03-01')).rejects.toBeInstanceOf(
                BadRequestException,
            );
        });
    });
});

describe('MobileAttendanceController', () => {
    function guardsOf(
        method: 'serverTime' | 'bootstrap' | 'today' | 'history' | 'uploadEvidence' | 'check' | 'sync',
    ) {
        return Reflect.getMetadata(GUARDS_METADATA, MobileAttendanceController.prototype[method]) ?? [];
    }

    it('deja server-time sin guard y protege el resto con el JWT móvil', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, MobileAttendanceController) ?? []).toEqual([]);
        expect(guardsOf('serverTime')).toEqual([]);
        expect(guardsOf('bootstrap')).toContain(MobileJwtAuthGuard);
        expect(guardsOf('today')).toContain(MobileJwtAuthGuard);
        expect(guardsOf('history')).toContain(MobileJwtAuthGuard);
        expect(guardsOf('uploadEvidence')).toContain(MobileJwtAuthGuard);
        expect(guardsOf('check')).toContain(MobileJwtAuthGuard);
        expect(guardsOf('sync')).toContain(MobileJwtAuthGuard);
    });

    it('no reenvía idEmpleado al servicio', () => {
        const attendance = {
            serverTime: jest.fn(),
            bootstrap: jest.fn(),
            today: jest.fn(),
            history: jest.fn(),
        };
        const controller = new MobileAttendanceController(attendance as unknown as MobileAttendanceService);

        controller.serverTime();
        controller.bootstrap(userMovil);
        controller.today(userMovil);
        controller.history(userMovil, {
            from: '2026-09-01',
            to: '2026-09-27',
            idEmpleado: 99,
        } as HistoryQueryDto & { idEmpleado: number });

        expect(attendance.serverTime).toHaveBeenCalledWith();
        expect(attendance.today).toHaveBeenCalledWith(userMovil);
        expect(attendance.today.mock.calls[0]).toHaveLength(1);
        expect(attendance.history).toHaveBeenCalledWith(userMovil, '2026-09-01', '2026-09-27');
    });

    it('el query del historial rechaza idEmpleado', async () => {
        const pipe = new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        });

        await expect(
            pipe.transform(
                { from: '2026-09-01', to: '2026-09-27', idEmpleado: 42 },
                { type: 'query', metatype: HistoryQueryDto, data: undefined },
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
