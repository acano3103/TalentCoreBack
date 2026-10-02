jest.mock('src/prisma/prisma.service', () => ({
    PrismaService: class PrismaService {},
}));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as request from 'supertest';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { AttendanceEngineService } from 'src/modules/attendance/engine/attendance-engine.service';
import { DEFAULT_ATTENDANCE_CONFIG } from 'src/modules/config/attendance-config/interfaces/attendance-config.interface';
import { AttendanceTrackingConfigService } from 'src/modules/config/attendance-config/attendance-config.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MobileJwtAuthGuard } from '../mobile-auth/guards/mobile-jwt-auth.guard';
import { MobileAttendanceController } from './mobile-attendance.controller';
import { MobileAttendanceService, MobileAttendanceUser } from './mobile-attendance.service';

const userMovil: MobileAttendanceUser = {
    id: 7,
    uuid: 'user-uuid',
    idTenant: 1,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'Lopez',
    email: 'ana@example.com',
    idEmpleado: 10,
    idEmpresa: 2,
};

const IDENT_DISPOSITIVO = 'pixel-ana-001';

function horaReloj(hora: number, minuto = 0): Date {
    return new Date(Date.UTC(1970, 0, 1, hora, minuto, 0));
}

function crearMemoria() {
    const registros: any[] = [];
    const jornadas: any[] = [];
    const dispositivos = [
        {
            idDispositivo: 1,
            idTenant: 1,
            idEmpresa: 2,
            idEmpleado: 10,
            identificadorDispositivo: IDENT_DISPOSITIVO,
            estatus: 'APROBADO',
            ultimoUso: null as Date | null,
        },
    ];
    let seqRegistro = 1n;
    let seqJornada = 1;
    const state = {
        horario: {
            idEmpleado: 10,
            DiaSemana: 'Lunes',
            HoraEntrada: horaReloj(8),
            HoraSalida: horaReloj(17),
        } as null | {
            idEmpleado: number;
            DiaSemana: string;
            HoraEntrada: Date | null;
            HoraSalida: Date | null;
        },
        relacionesMovil: [] as any[],
        legal: null as any,
        evidencias: [] as any[],
    };

    const empleado = {
        idEmpleado: 10,
        idTenant: 1,
        idEmpresa: 2,
        idSite: 7,
    };

    const ordenar = (filas: any[], orderBy?: Record<string, 'asc' | 'desc'>) => {
        if (!orderBy) return [...filas];
        const campo = Object.keys(orderBy)[0];
        const dir = orderBy[campo] === 'desc' ? -1 : 1;
        return [...filas].sort((a, b) => {
            const av = a[campo] instanceof Date ? a[campo].getTime() : a[campo];
            const bv = b[campo] instanceof Date ? b[campo].getTime() : b[campo];
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return 0;
        });
    };

    const filtrarRegistros = (where: any = {}) =>
        registros.filter((registro) => {
            if (where.idEmpleado != null && registro.idEmpleado !== where.idEmpleado) {
                return false;
            }
            if (where.tipo && registro.tipo !== where.tipo) return false;
            if (
                where.estatusProcesamiento &&
                registro.estatusProcesamiento !== where.estatusProcesamiento
            ) {
                return false;
            }
            if (where.idJornada != null && registro.idJornada !== where.idJornada) {
                return false;
            }
            if (where.JornadasEmpleado?.fecha) {
                const jornada = jornadas.find((item) => item.idJornada === registro.idJornada);
                if (
                    !jornada ||
                    jornada.fecha.getTime() !== where.JornadasEmpleado.fecha.getTime()
                ) {
                    return false;
                }
            }
            if (
                where.fechaHoraRegistro?.gte &&
                registro.fechaHoraRegistro < where.fechaHoraRegistro.gte
            ) {
                return false;
            }
            if (
                where.fechaHoraRegistro?.lte &&
                registro.fechaHoraRegistro > where.fechaHoraRegistro.lte
            ) {
                return false;
            }
            return true;
        });

    const prisma = {
        empleados: {
            findUnique: jest.fn(async () => empleado),
            findFirst: jest.fn(async () => ({
                idEmpleado: 10,
                numeroEmpleado: 'E-100',
                nombre: 'Ana',
                primerApellido: 'López',
                segundoApellido: null,
                CatPuestos: { NombrePuesto: 'Analista' },
            })),
        },
        relEmpleadosSites: {
            findFirst: jest.fn(async ({ where }: any) => {
                if (where?.EsPrincipal) {
                    return {
                        idSite: 3,
                        CatSites: { zonaHoraria: 'America/Mexico_City', Descripcion: 'Sucursal Norte' },
                    };
                }
                return null;
            }),
            findMany: jest.fn(async ({ where }: any) => {
                if (!where?.MetodoAsistencia) return [];
                return state.relacionesMovil.filter(
                    (rel) => rel.idEmpleado === where.idEmpleado && rel.Activo,
                );
            }),
        },
        catSites: {
            findUnique: jest.fn(async () => ({ zonaHoraria: 'America/Mexico_City' })),
        },
        horariosEmpleado: {
            findFirst: jest.fn(async ({ where }: any) => {
                if (!state.horario) return null;
                if (where.idEmpleado !== state.horario.idEmpleado) return null;
                if (where.DiaSemana !== state.horario.DiaSemana) return null;
                return state.horario;
            }),
        },
        registrosAsistencia: {
            findUnique: jest.fn(async ({ where }: any) => {
                if (where.uuidCliente) {
                    return registros.find((r) => r.uuidCliente === where.uuidCliente) ?? null;
                }
                return null;
            }),
            findFirst: jest.fn(async ({ where, orderBy }: any) => {
                const filas = ordenar(filtrarRegistros(where), orderBy);
                return filas[0] ?? null;
            }),
            findMany: jest.fn(async ({ where, orderBy }: any) =>
                ordenar(filtrarRegistros(where), orderBy),
            ),
            create: jest.fn(async ({ data }: any) => {
                const registro = { idRegistro: seqRegistro++, ...data };
                registros.push(registro);
                return registro;
            }),
        },
        jornadasEmpleado: {
            findUnique: jest.fn(async ({ where }: any) => {
                if (where.idJornada != null) {
                    return jornadas.find((j) => j.idJornada === where.idJornada) ?? null;
                }
                if (where.idEmpleado_fecha) {
                    const { idEmpleado, fecha } = where.idEmpleado_fecha;
                    return (
                        jornadas.find(
                            (j) =>
                                j.idEmpleado === idEmpleado && j.fecha.getTime() === fecha.getTime(),
                        ) ?? null
                    );
                }
                return null;
            }),
            upsert: jest.fn(async ({ where, create, update }: any) => {
                const { idEmpleado, fecha } = where.idEmpleado_fecha;
                let jornada = jornadas.find(
                    (j) => j.idEmpleado === idEmpleado && j.fecha.getTime() === fecha.getTime(),
                );
                if (!jornada) {
                    jornada = {
                        idJornada: seqJornada++,
                        minutosTrabajados: 0,
                        minutosRetardo: 0,
                        minutosComida: 0,
                        minutosComidaExcedidos: 0,
                        minutosExtraDobles: 0,
                        minutosExtraTriples: 0,
                        horaEntradaReal: null,
                        horaSalidaReal: null,
                        horaInicioComidaReal: null,
                        horaFinComidaReal: null,
                        revisada: false,
                        estatusJornada: 'ABIERTA',
                        ...create,
                    };
                    jornadas.push(jornada);
                } else {
                    Object.assign(jornada, update);
                }
                return jornada;
            }),
            update: jest.fn(async ({ where, data }: any) => {
                const jornada = jornadas.find((j) => j.idJornada === where.idJornada);
                if (!jornada) throw new Error('jornada no encontrada');
                Object.assign(jornada, data);
                return jornada;
            }),
        },
        configuracionJornadaLegal: {
            findFirst: jest.fn(async () => state.legal),
        },
        asistenciaEvidencias: {
            findUnique: jest.fn(
                async ({ where }: any) =>
                    state.evidencias.find((e) => e.idEvidencia === where.idEvidencia) ?? null,
            ),
            update: jest.fn(async ({ where, data }: any) => {
                const evidencia = state.evidencias.find((e) => e.idEvidencia === where.idEvidencia);
                if (!evidencia) throw new Error('evidencia no encontrada');
                Object.assign(evidencia, data);
                return evidencia;
            }),
        },
        dispositivosAsistencia: {
            findUnique: jest.fn(async ({ where }: any) => {
                const clave = where.idTenant_identificadorDispositivo;
                if (!clave) return null;
                return (
                    dispositivos.find(
                        (item) =>
                            item.idTenant === clave.idTenant &&
                            item.identificadorDispositivo === clave.identificadorDispositivo,
                    ) ?? null
                );
            }),
            update: jest.fn(async ({ where, data }: any) => {
                const dispositivo = dispositivos.find(
                    (item) => item.idDispositivo === where.idDispositivo,
                );
                if (!dispositivo) throw new Error('dispositivo no encontrado');
                Object.assign(dispositivo, data);
                return dispositivo;
            }),
        },
        $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };

    return { prisma, registros, jornadas, dispositivos, state };
}

function bodyCheck(parcial: Record<string, unknown> = {}) {
    return {
        uuidCliente: '550e8400-e29b-41d4-a716-446655440000',
        tipo: 'ENTRADA',
        fechaHoraRegistro: '2026-09-21T09:00:00-06:00',
        identificadorDispositivo: IDENT_DISPOSITIVO,
        latitud: 19.432608,
        longitud: -99.133209,
        precisionMetros: 10,
        ...parcial,
    };
}

describe('MobileAttendanceController (check)', () => {
    let app: INestApplication;
    let memoria: ReturnType<typeof crearMemoria>;
    let config: typeof DEFAULT_ATTENDANCE_CONFIG;

    beforeEach(async () => {
        memoria = crearMemoria();
        config = structuredClone(DEFAULT_ATTENDANCE_CONFIG);
        config.movil.selfieObligatoria = false;
        config.comida.obligatorioChecarComida = false;

        const module = await Test.createTestingModule({
            controllers: [MobileAttendanceController],
            providers: [
                MobileAttendanceService,
                AttendanceEngineService,
                { provide: PrismaService, useValue: memoria.prisma },
                {
                    provide: AttendanceTrackingConfigService,
                    useValue: { getConfiguracionAsistencia: jest.fn(async () => config) },
                },
                { provide: ConfigService, useValue: { get: jest.fn() } },
            ],
        })
            .overrideGuard(MobileJwtAuthGuard)
            .useValue({
                canActivate: (context: { switchToHttp: () => { getRequest: () => { user: MobileAttendanceUser } } }) => {
                    context.switchToHttp().getRequest().user = userMovil;
                    return true;
                },
            })
            .compile();

        app = module.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
            }),
        );
        app.useGlobalFilters(new HttpExceptionFilter());
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    it('protege evidence, check y sync con el JWT móvil', () => {
        expect(
            Reflect.getMetadata(GUARDS_METADATA, MobileAttendanceController.prototype.uploadEvidence),
        ).toContain(MobileJwtAuthGuard);
        expect(
            Reflect.getMetadata(GUARDS_METADATA, MobileAttendanceController.prototype.check),
        ).toContain(MobileJwtAuthGuard);
        expect(
            Reflect.getMetadata(GUARDS_METADATA, MobileAttendanceController.prototype.sync),
        ).toContain(MobileJwtAuthGuard);
    });

    it('check con dispositivo PENDIENTE responde 403 DISPOSITIVO_NO_APROBADO', async () => {
        memoria.dispositivos[0].estatus = 'PENDIENTE';

        const res = await request(app.getHttpServer())
            .post('/mobile/attendance/check')
            .send(bodyCheck())
            .expect(403);

        expect(res.body.code).toBe('DISPOSITIVO_NO_APROBADO');
        expect(res.body.detail).toEqual({ estatus: 'PENDIENTE' });
        expect(res.body.message).toMatch(/pendiente de autorización/i);
        expect(memoria.registros).toHaveLength(0);
    });

    it('check con tipo inválido para el estado responde 409 con permitidos', async () => {
        const res = await request(app.getHttpServer())
            .post('/mobile/attendance/check')
            .send(bodyCheck({ tipo: 'SALIDA' }))
            .expect(409);

        expect(res.body.code).toBe('TRANSICION_INVALIDA');
        expect(res.body.detail.estadoActual).toBe('NINGUNO');
        expect(res.body.detail.permitidos).toEqual(['ENTRADA']);
        expect(res.body.message).toMatch(/no puedes registrar salida/i);
        expect(memoria.registros).toHaveLength(0);
    });

    it('check fuera de geocerca en modo bloqueo responde 422 y deja RECHAZADO', async () => {
        config.movil.permitirFueraGeocercaConJustificacion = false;
        memoria.state.relacionesMovil = [
            {
                idEmpleado: 10,
                idSite: 3,
                Activo: true,
                MetodoAsistencia: 'APP_MOVIL',
                CatSites: {
                    Descripcion: 'Sucursal Norte',
                    CatGeocercas: [
                        {
                            idGeocerca: 5,
                            Nombre: 'Cerca Norte',
                            Activo: true,
                            Tipo: 'circle',
                            Latitud: 19.432608,
                            Longitud: -99.133209,
                            Radio: 100,
                            RelGeocercaVertices: [],
                        },
                    ],
                },
            },
        ];

        const res = await request(app.getHttpServer())
            .post('/mobile/attendance/check')
            .send(
                bodyCheck({
                    latitud: 19.5,
                    longitud: -99.133209,
                    precisionMetros: 12,
                }),
            )
            .expect(422);

        expect(res.body.code).toBe('GEOCERCA_BLOQUEADA');
        expect(res.body.detail.geocercaMasCercana).toBe('Sucursal Norte');
        expect(res.body.detail.idRegistro).toBeDefined();
        expect(res.body.message).toMatch(/acércate al área asignada/i);
        expect(memoria.registros).toHaveLength(1);
        expect(memoria.registros[0].estatusProcesamiento).toBe('RECHAZADO');
        expect(memoria.registros[0].resultadoGeocerca).toBe('FUERA_BLOQUEADA');
    });

    it('el mismo uuidCliente dos veces responde 200 duplicado y un solo registro', async () => {
        const primera = await request(app.getHttpServer())
            .post('/mobile/attendance/check')
            .send(bodyCheck())
            .expect(200);

        const segunda = await request(app.getHttpServer())
            .post('/mobile/attendance/check')
            .send(bodyCheck())
            .expect(200);

        expect(primera.body.duplicado).toBe(false);
        expect(segunda.body.duplicado).toBe(true);
        expect(segunda.body.idRegistro).toBe(primera.body.idRegistro);
        expect(memoria.registros).toHaveLength(1);
    });

    it('selfie obligatoria sin idEvidencia responde 400 EVIDENCIA_REQUERIDA', async () => {
        config.movil.selfieObligatoria = true;

        const res = await request(app.getHttpServer())
            .post('/mobile/attendance/check')
            .send(bodyCheck())
            .expect(400);

        expect(res.body.code).toBe('EVIDENCIA_REQUERIDA');
        expect(res.body.message).toMatch(/selfie/i);
        expect(memoria.registros).toHaveLength(0);
    });

    it('evidencia de otro empleado responde 400', async () => {
        config.movil.selfieObligatoria = true;
        memoria.state.evidencias.push({
            idEvidencia: 21,
            idEmpleado: 99,
            consumida: false,
            rutaArchivo: 'media/attendance/2/2026/09/ajena.jpg',
        });

        const res = await request(app.getHttpServer())
            .post('/mobile/attendance/check')
            .send(bodyCheck({ idEvidencia: 21 }))
            .expect(400);

        expect(res.body.code).toBe('EVIDENCIA_AJENA');
        expect(res.body.message).toMatch(/no corresponde a tu usuario/i);
        expect(memoria.registros).toHaveLength(0);
    });

    it('evidencia ya consumida responde 400', async () => {
        config.movil.selfieObligatoria = true;
        memoria.state.evidencias.push({
            idEvidencia: 22,
            idEmpleado: 10,
            consumida: true,
            rutaArchivo: 'media/attendance/2/2026/09/usada.jpg',
        });

        const res = await request(app.getHttpServer())
            .post('/mobile/attendance/check')
            .send(bodyCheck({ idEvidencia: 22 }))
            .expect(400);

        expect(res.body.code).toBe('EVIDENCIA_CONSUMIDA');
        expect(res.body.message).toMatch(/ya se usó/i);
        expect(memoria.registros).toHaveLength(0);
    });
});

describe('MobileAttendanceController (sync)', () => {
    let app: INestApplication;
    let memoria: ReturnType<typeof crearMemoria>;
    let config: typeof DEFAULT_ATTENDANCE_CONFIG;

    beforeEach(async () => {
        memoria = crearMemoria();
        config = structuredClone(DEFAULT_ATTENDANCE_CONFIG);
        config.movil.selfieObligatoria = false;
        config.comida.obligatorioChecarComida = false;

        const module = await Test.createTestingModule({
            controllers: [MobileAttendanceController],
            providers: [
                MobileAttendanceService,
                AttendanceEngineService,
                { provide: PrismaService, useValue: memoria.prisma },
                {
                    provide: AttendanceTrackingConfigService,
                    useValue: { getConfiguracionAsistencia: jest.fn(async () => config) },
                },
                { provide: ConfigService, useValue: { get: jest.fn() } },
            ],
        })
            .overrideGuard(MobileJwtAuthGuard)
            .useValue({
                canActivate: (context: {
                    switchToHttp: () => { getRequest: () => { user: MobileAttendanceUser } };
                }) => {
                    context.switchToHttp().getRequest().user = userMovil;
                    return true;
                },
            })
            .compile();

        app = module.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
            }),
        );
        app.useGlobalFilters(new HttpExceptionFilter());
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    function uuid(n: number) {
        return `550e8400-e29b-41d4-a716-44665544${String(n).padStart(4, '0')}`;
    }

    it('ordena el lote desordenado (SALIDA antes que ENTRADA) y acepta ambas', async () => {
        const res = await request(app.getHttpServer())
            .post('/mobile/attendance/sync')
            .send({
                items: [
                    bodyCheck({
                        uuidCliente: uuid(2),
                        tipo: 'SALIDA',
                        fechaHoraRegistro: '2026-09-21T17:00:00-06:00',
                    }),
                    bodyCheck({
                        uuidCliente: uuid(1),
                        tipo: 'ENTRADA',
                        fechaHoraRegistro: '2026-09-21T09:00:00-06:00',
                    }),
                ],
            })
            .expect(200);

        expect(res.body).toMatchObject({
            procesados: 2,
            aceptados: 2,
            rechazados: 0,
            duplicados: 0,
        });
        expect(res.body.resultados.map((r: { tipo: string }) => r.tipo)).toEqual([
            'ENTRADA',
            'SALIDA',
        ]);
        expect(res.body.resultados.every((r: { aceptado: boolean }) => r.aceptado)).toBe(true);
        expect(memoria.registros).toHaveLength(2);
        expect(memoria.registros.map((r) => r.tipo)).toEqual(['ENTRADA', 'SALIDA']);
    });

    it('un item inválido en medio no aborta el lote y devuelve reintentable:false', async () => {
        const res = await request(app.getHttpServer())
            .post('/mobile/attendance/sync')
            .send({
                items: [
                    bodyCheck({
                        uuidCliente: uuid(1),
                        tipo: 'ENTRADA',
                        fechaHoraRegistro: '2026-09-21T09:00:00-06:00',
                    }),
                    bodyCheck({
                        uuidCliente: uuid(2),
                        tipo: 'FIN_COMIDA',
                        fechaHoraRegistro: '2026-09-21T12:00:00-06:00',
                    }),
                    bodyCheck({
                        uuidCliente: uuid(3),
                        tipo: 'SALIDA',
                        fechaHoraRegistro: '2026-09-21T17:00:00-06:00',
                    }),
                ],
            })
            .expect(200);

        expect(res.body).toMatchObject({
            procesados: 3,
            aceptados: 2,
            rechazados: 1,
            duplicados: 0,
        });
        expect(res.body.resultados[0]).toMatchObject({
            uuidCliente: uuid(1),
            aceptado: true,
            tipo: 'ENTRADA',
            reintentable: false,
        });
        expect(res.body.resultados[1]).toMatchObject({
            uuidCliente: uuid(2),
            aceptado: false,
            reintentable: false,
            error: { code: 'TRANSICION_INVALIDA' },
        });
        expect(res.body.resultados[2]).toMatchObject({
            uuidCliente: uuid(3),
            aceptado: true,
            tipo: 'SALIDA',
            reintentable: false,
        });
        expect(memoria.registros).toHaveLength(2);
    });

    it('un lote con 51 items responde 400', async () => {
        const items = Array.from({ length: 51 }, (_, i) =>
            bodyCheck({
                uuidCliente: uuid(i + 1),
                fechaHoraRegistro: `2026-09-21T09:${String(i % 60).padStart(2, '0')}:00-06:00`,
            }),
        );

        const res = await request(app.getHttpServer())
            .post('/mobile/attendance/sync')
            .send({ items })
            .expect(400);

        const mensaje = Array.isArray(res.body.message)
            ? res.body.message.join(' ')
            : String(res.body.message);
        expect(mensaje).toMatch(/máximo 50/i);
        expect(memoria.registros).toHaveLength(0);
    });

    it('el mismo uuidCliente dos veces en el lote marca el segundo como duplicado', async () => {
        const mismo = uuid(1);
        const res = await request(app.getHttpServer())
            .post('/mobile/attendance/sync')
            .send({
                items: [
                    bodyCheck({
                        uuidCliente: mismo,
                        tipo: 'ENTRADA',
                        fechaHoraRegistro: '2026-09-21T09:00:00-06:00',
                    }),
                    bodyCheck({
                        uuidCliente: mismo,
                        tipo: 'ENTRADA',
                        fechaHoraRegistro: '2026-09-21T09:00:01-06:00',
                    }),
                ],
            })
            .expect(200);

        expect(res.body).toMatchObject({
            procesados: 2,
            aceptados: 2,
            rechazados: 0,
            duplicados: 1,
        });
        expect(res.body.resultados[0]).toMatchObject({
            uuidCliente: mismo,
            aceptado: true,
            duplicado: false,
            reintentable: false,
        });
        expect(res.body.resultados[1]).toMatchObject({
            uuidCliente: mismo,
            aceptado: true,
            duplicado: true,
            reintentable: false,
            idRegistro: res.body.resultados[0].idRegistro,
        });
        expect(memoria.registros).toHaveLength(1);
    });

    it('un registro de hace 100 h se acepta con advertencia y revisada=false', async () => {
        const hace100h = new Date(Date.now() - 100 * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

        const res = await request(app.getHttpServer())
            .post('/mobile/attendance/sync')
            .send({
                items: [
                    bodyCheck({
                        uuidCliente: uuid(1),
                        tipo: 'ENTRADA',
                        fechaHoraRegistro: hace100h,
                        esOffline: true,
                    }),
                ],
            })
            .expect(200);

        expect(res.body).toMatchObject({
            procesados: 1,
            aceptados: 1,
            rechazados: 0,
        });
        expect(res.body.resultados[0]).toMatchObject({
            aceptado: true,
            reintentable: false,
            duplicado: false,
        });
        expect(res.body.resultados[0].advertencias.join(' ')).toMatch(/72 horas/i);
        expect(memoria.registros).toHaveLength(1);
        expect(memoria.jornadas).toHaveLength(1);
        expect(memoria.jornadas[0].revisada).toBe(false);
    });

    it('no usa Promise.all para procesar el lote', () => {
        const fuente = readFileSync(join(__dirname, 'mobile-attendance.service.ts'), 'utf8');
        const bloqueSync = fuente.slice(
            fuente.indexOf('async sync('),
            fuente.indexOf('private async resolverDispositivoAprobado'),
        );
        expect(bloqueSync).not.toMatch(/Promise\.all/);
    });
});
