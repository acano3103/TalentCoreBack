import { BadRequestException } from '@nestjs/common';
import {
    GUARDS_METADATA,
    METHOD_METADATA,
    PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { CourseLearningService } from 'src/modules/courses/learning/course-learning.service';
import { ventanaAsistencia } from 'src/modules/courses/attendance/ventana-asistencia';
import { MobileJwtAuthGuard } from '../mobile-auth/guards/mobile-jwt-auth.guard';
import { RangoClasesQuery } from './dto/rango-clases.query';
import { RegistrarAsistenciaQrDto } from './dto/registrar-asistencia-qr.dto';
import { MobileClassesController } from './mobile-classes.controller';
import { MobileTrainingService } from './mobile-training.service';

const user = {
    id: 3,
    uuid: 'user-3',
    idTenant: 1,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'López',
} as ActiveUserDto;

const AHORA = new Date('2026-11-20T18:00:00.000Z');
const TOKEN = 'iv:token';

function fila(sesion: any) {
    return { CursoSesiones: sesion };
}

function clase(
    id: number,
    inicio: string,
    estatus = 'programada',
    asistencia: { fecha: string; metodo: string } | null = null,
) {
    return {
        idFechaClase: id,
        tituloClase: id === 2 ? null : `Clase ${id}`,
        estatus,
        fechaHoraInicio: new Date(inicio),
        fechaHoraFin: new Date(new Date(inicio).getTime() + 2 * 60 * 60_000),
        CursoAsistencias: asistencia
            ? [
                    {
                        fechaHoraRegistro: new Date(asistencia.fecha),
                        metodoRegistro: asistencia.metodo,
                    },
                ]
            : [],
    };
}

function sesion(opts: {
    idSesion: number;
    modalidad?: 'presencial' | 'online_sincrono';
    nombre?: string;
    estatus?: string;
    tenant?: number;
    instructor?: 'interno' | 'externo';
    link?: string | null;
    clases: any[];
}) {
    return {
        idSesion: opts.idSesion,
        modalidad: opts.modalidad ?? 'presencial',
        estatus: opts.estatus ?? 'en_curso',
        minutosToleranciaQr: 15,
        ubicacionFisica: 'Sala 1',
        linkReunion: opts.link === undefined ? 'https://no-presencial' : opts.link,
        tipoInstructor: opts.instructor ?? 'interno',
        nombreInstructorExterno: 'Ana Ruiz',
        empresaInstructorExterno: 'Acme',
        CatCursos: {
            idTenant: opts.tenant ?? 1,
            Descripcion: opts.nombre ?? 'Inducción',
        },
        Empleados: { nombre: 'Luis', primerApellido: 'Paz', segundoApellido: '' },
        CursoFechasClase: opts.clases,
    };
}

function servicio(filas: any[] = []) {
    const prisma = {
        auth_user: {
            findUnique: jest
                .fn()
                .mockResolvedValue({ Empleados: [{ idEmpleado: 50 }] }),
        },
        catSites: {
            findFirst: jest
                .fn()
                .mockResolvedValue({ zonaHoraria: 'America/Mexico_City' }),
        },
        cursoParticipantes: {
            findMany: jest.fn().mockResolvedValue(filas),
            findFirst: jest.fn(),
        },
        cursoFechasClase: { findUnique: jest.fn() },
        cursoAsistencias: {
            create: jest.fn().mockResolvedValue({}),
            findUnique: jest.fn(),
        },
        cursoLecciones: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const crypto = {
        decrypt: jest.fn((texto: string) => {
            if (texto === TOKEN) return '10';
            if (texto === '99') return '99';
            if (texto === 'missing') return '404';
            throw new Error('mal');
        }),
        encrypt: jest.fn(),
    };
    const learning = new CourseLearningService({} as any, {} as any);
    const gamificacion = {
        calcular: jest.fn().mockResolvedValue({
            xp: 0,
            conteos: {
                lecciones: 0,
                quizzes: 0,
                quizzesPrimera: 0,
                cursos: 0,
                cursosATiempo: 0,
                asistencias: 0,
            },
            nivel: {
                numero: 1,
                nombre: 'Explorador',
                xp: 0,
                xpDesde: 0,
                xpSiguiente: 300,
            },
            racha: { semanas: 0, activaEstaSemana: false, ultimas8: [] },
            insignias: [],
        }),
        sincronizarInsignias: jest.fn().mockResolvedValue([]),
    };
    const career = {
        resumenEmpleado: jest.fn().mockResolvedValue(null),
        findPlanesEmpleado: jest.fn().mockResolvedValue({ planes: [] }),
    };
    const service = new MobileTrainingService(
        prisma as any,
        learning,
        crypto as any,
        gamificacion as any,
        {} as any,
        career as any,
    );
    return { prisma, crypto, service, gamificacion };
}

const presenciales = [
    clase(1, '2026-11-01T15:00:00.000Z', 'completada', {
        fecha: '2026-11-01T15:05:00.000Z',
        metodo: 'manual_instructor',
    }),
    clase(2, '2026-11-10T15:00:00.000Z', 'cancelada'),
    clase(10, '2026-11-20T18:00:00.000Z'),
];

const catalogo = [
    fila(sesion({ idSesion: 4, clases: presenciales })),
    fila(
        sesion({
            idSesion: 8,
            modalidad: 'online_sincrono',
            nombre: 'En vivo',
            instructor: 'externo',
            link: 'https://meet.example/sala',
            clases: [clase(20, '2026-11-20T17:50:00.000Z')],
        }),
    ),
    fila(
        sesion({
            idSesion: 30,
            estatus: 'cancelado',
            clases: [clase(30, '2026-11-20T18:00:00.000Z')],
        }),
    ),
    fila(
        sesion({
            idSesion: 80,
            tenant: 9,
            clases: [clase(80, '2026-11-20T18:00:00.000Z')],
        }),
    ),
    fila(
        sesion({
            idSesion: 90,
            clases: [
                clase(90, '2026-10-01T18:00:00.000Z'),
                clase(91, '2027-03-01T18:00:00.000Z'),
            ],
        }),
    ),
];

describe('clases del empleado', () => {
    it('numera solo las clases vigentes, ordena por inicio y deja fuera el otro tenant y lo muy lejano', async () => {
        const { prisma, service } = servicio(catalogo);
        const lista = await service.listarClases(
            7,
            user,
            undefined,
            undefined,
            AHORA,
        );
        const porId = Object.fromEntries(
            lista.map((item) => [item.idFechaClase, item]),
        );

        expect(prisma.cursoParticipantes.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    idEmpleado: 50,
                    CursoSesiones: {
                        idEmpresa: 7,
                        modalidad: { in: ['presencial', 'online_sincrono'] },
                    },
                },
            }),
        );
        expect(lista.map((item) => item.idFechaClase)).toEqual([1, 2, 20, 10, 30]);
        expect(porId[1].numero).toBe(1);
        expect(porId[2].numero).toBe(0);
        expect(porId[10].numero).toBe(2);
        expect(porId[1].totalClases).toBe(2);
        expect(porId[2].totalClases).toBe(2);
        expect(porId[10].totalClases).toBe(2);
        expect(porId[10].tituloClase).toBe('Clase 10');
        expect(porId[2].tituloClase).toBeNull();
        expect(porId[10].instructor).toBe('Luis Paz');
        expect(porId[10].linkReunion).toBeNull();
        expect(porId[10].puedeRegistrar).toBe(true);
        expect(porId[10].puedeUnirse).toBe(false);
        expect(porId[1].asistencia).toEqual({
            registrada: true,
            fechaHoraRegistro: '2026-11-01T15:05:00.000Z',
            metodo: 'manual_instructor',
        });
        expect(porId[1].puedeRegistrar).toBe(false);
        expect(porId[20].modalidad).toBe('online_sincrono');
        expect(porId[20].instructor).toBe('Ana Ruiz (Acme)');
        expect(porId[20].linkReunion).toBe('https://meet.example/sala');
        expect(porId[20].puedeUnirse).toBe(true);
        expect(porId[20].numero).toBe(1);
        expect(porId[20].totalClases).toBe(1);
        expect(porId[30].puedeRegistrar).toBe(false);
        expect(porId[30].puedeUnirse).toBe(false);
        expect(porId[10].ventana.estado).toBe('abierta');
    });

    it('unirse abre 10 minutos antes y el pase de lista usa la tolerancia de la sesión', async () => {
        const { service } = servicio(catalogo);
        const antes = await service.listarClases(
            7,
            user,
            undefined,
            undefined,
            new Date('2026-11-20T17:39:00.000Z'),
        );
        const enPunto = await service.listarClases(
            7,
            user,
            undefined,
            undefined,
            new Date('2026-11-20T17:40:00.000Z'),
        );
        const enLineaAntes = antes.find((item) => item.idFechaClase === 20);
        const enLinea = enPunto.find((item) => item.idFechaClase === 20);

        expect(enLineaAntes?.puedeRegistrar).toBe(true);
        expect(enLineaAntes?.puedeUnirse).toBe(false);
        expect(enLinea?.puedeUnirse).toBe(true);
    });

    it('un rango explícito no cambia el número de la clase dentro de la sesión', async () => {
        const { service } = servicio(catalogo);
        const lista = await service.listarClases(
            7,
            user,
            '2026-11-20T00:00:00.000Z',
            '2026-11-20T23:59:59.000Z',
            AHORA,
        );
        const claseDiez = lista.find((item) => item.idFechaClase === 10);

        expect(lista.map((item) => item.idFechaClase)).toEqual([20, 10, 30]);
        expect(claseDiez?.numero).toBe(2);
        expect(claseDiez?.totalClases).toBe(2);
    });

    it('rechaza un rango invertido', async () => {
        const { service } = servicio(catalogo);
        await expect(
            service.listarClases(
                7,
                user,
                '2026-12-01T00:00:00.000Z',
                '2026-11-01T00:00:00.000Z',
                AHORA,
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('asistencia con QR', () => {
    function construir(
        patch: {
            empresa?: number;
            tenant?: number;
            estatus?: string;
            participantes?: any[];
            asistencia?: Date | null;
        } = {},
    ) {
        const actual = clase(
            10,
            '2026-11-20T18:00:00.000Z',
            patch.estatus ?? 'programada',
            patch.asistencia
                ? { fecha: patch.asistencia.toISOString(), metodo: 'qr_autoatendido' }
                : null,
        );
        const curso = sesion({
            idSesion: 4,
            instructor: 'externo',
            link: null,
            tenant: patch.tenant,
            clases: [
                clase(1, '2026-11-01T15:00:00.000Z', 'completada', {
                    fecha: '2026-11-01T15:10:00.000Z',
                    metodo: 'manual_instructor',
                }),
                clase(2, '2026-11-10T15:00:00.000Z', 'cancelada'),
                actual,
            ],
        });
        return {
            ...actual,
            CursoSesiones: {
                ...curso,
                idEmpresa: patch.empresa ?? 7,
                CursoParticipantes: patch.participantes ?? [{ idEmpleado: 50 }],
            },
        };
    }

    async function registrar(
        codigo: string,
        claseQr: any,
        ahora = AHORA,
        ip = '203.0.113.8',
    ) {
        const { prisma, crypto, service } = servicio();
        prisma.cursoFechasClase.findUnique.mockResolvedValue(claseQr);
        const resultado = await service.registrarAsistenciaQr(
            7,
            codigo,
            ip,
            user,
            ahora,
        );
        return { prisma, crypto, resultado };
    }

    it.each([
        `https://front.example/attendance/class/${encodeURIComponent(TOKEN)}`,
        TOKEN,
        encodeURIComponent(TOKEN),
    ])('registra con %s', async (codigo) => {
        const { prisma, resultado } = await registrar(codigo, construir());

        expect(resultado).toMatchObject({
            registrada: true,
            duplicada: false,
            idFechaClase: 10,
            idSesion: 4,
            nombreCurso: 'Inducción',
            numeroClase: 2,
            totalClases: 2,
            fechaHoraRegistro: AHORA.toISOString(),
            asistencia: { asistidas: 2, total: 2, porcentaje: 100 },
        });
        expect(prisma.cursoAsistencias.create).toHaveBeenCalledWith({
            data: {
                idFechaClase: 10,
                idEmpleado: 50,
                fechaHoraRegistro: AHORA,
                metodoRegistro: 'app_movil',
                ipRegistro: '203.0.113.8',
            },
        });
    });

    it('un código ilegible o de una clase inexistente responde QR_NO_VALIDO', async () => {
        const basura = servicio();
        await expect(
            basura.service.registrarAsistenciaQr(
                7,
                'esto-no-es-un-qr',
                null,
                user,
                AHORA,
            ),
        ).rejects.toMatchObject({
            status: 404,
            response: {
                code: 'QR_NO_VALIDO',
                message: 'Este código no corresponde a una clase de Talent Core.',
            },
        });
        expect(basura.prisma.cursoFechasClase.findUnique).not.toHaveBeenCalled();

        const inexistente = servicio();
        inexistente.prisma.cursoFechasClase.findUnique.mockResolvedValue(null);
        await expect(
            inexistente.service.registrarAsistenciaQr(
                7,
                'missing',
                null,
                user,
                AHORA,
            ),
        ).rejects.toMatchObject({
            status: 404,
            response: { code: 'QR_NO_VALIDO' },
        });
        expect(inexistente.prisma.cursoAsistencias.create).not.toHaveBeenCalled();
    });

    it('una clase de otra empresa usa el mismo QR_NO_VALIDO', async () => {
        const { prisma, service } = servicio();
        prisma.cursoFechasClase.findUnique.mockImplementation(async ({ where }) =>
            where.idFechaClase === 99 ? construir({ empresa: 8 }) : null,
        );

        await expect(
            service.registrarAsistenciaQr(7, '99', null, user, AHORA),
        ).rejects.toMatchObject({
            status: 404,
            response: { code: 'QR_NO_VALIDO' },
        });
        expect(prisma.cursoAsistencias.create).not.toHaveBeenCalled();
    });

    it('la clase cancelada se rechaza antes de revisar la inscripción', async () => {
        const { prisma, service } = servicio();
        prisma.cursoFechasClase.findUnique.mockResolvedValue(
            construir({ estatus: 'cancelada', participantes: [] }),
        );

        await expect(
            service.registrarAsistenciaQr(7, TOKEN, null, user, AHORA),
        ).rejects.toMatchObject({
            status: 409,
            response: {
                code: 'CLASE_CANCELADA',
                message: 'Esta clase fue cancelada.',
            },
        });
    });

    it('quien no está inscrito recibe NO_INSCRITO', async () => {
        const { service, prisma } = servicio();
        prisma.cursoFechasClase.findUnique.mockResolvedValue(
            construir({ participantes: [] }),
        );

        await expect(
            service.registrarAsistenciaQr(7, TOKEN, null, user, AHORA),
        ).rejects.toMatchObject({
            status: 403,
            response: {
                code: 'NO_INSCRITO',
                message: 'No estás inscrito en este curso. Avisa a tu instructor.',
            },
        });
    });

    it('fuera de la ventana responde 409 con la misma ventana del pase público', async () => {
        const ahora = new Date('2026-11-20T17:00:00.000Z');
        const { service, prisma } = servicio();
        prisma.cursoFechasClase.findUnique.mockResolvedValue(construir());
        const esperada = ventanaAsistencia({
            fechaHoraInicio: new Date('2026-11-20T18:00:00.000Z'),
            fechaHoraFin: new Date('2026-11-20T20:00:00.000Z'),
            minutosToleranciaQr: 15,
            ahora,
        });

        await expect(
            service.registrarAsistenciaQr(7, TOKEN, null, user, ahora),
        ).rejects.toMatchObject({
            status: 409,
            response: {
                code: 'FUERA_DE_VENTANA',
                message: esperada.mensaje,
                ventana: {
                    estado: esperada.estado,
                    desde: esperada.desde.toISOString(),
                    hasta: esperada.hasta.toISOString(),
                },
            },
        });
        expect(prisma.cursoAsistencias.create).not.toHaveBeenCalled();
    });

    it('una asistencia ya registrada no cambia la hora', async () => {
        const vieja = new Date('2026-11-20T18:05:00.000Z');
        const { prisma, service } = servicio();
        prisma.cursoFechasClase.findUnique.mockResolvedValue(
            construir({ asistencia: vieja }),
        );

        const resultado = await service.registrarAsistenciaQr(
            7,
            TOKEN,
            '203.0.113.8',
            user,
            AHORA,
        );

        expect(resultado.duplicada).toBe(true);
        expect(resultado.fechaHoraRegistro).toBe(vieja.toISOString());
        expect(resultado.asistencia).toEqual({
            asistidas: 2,
            total: 2,
            porcentaje: 100,
        });
        expect(resultado).not.toHaveProperty('gamificacion');
        expect(prisma.cursoAsistencias.create).not.toHaveBeenCalled();
    });

    it('si dos registros llegan juntos, el segundo queda como duplicado', async () => {
        const vieja = new Date('2026-11-20T18:05:00.000Z');
        const { prisma, service } = servicio();
        prisma.cursoFechasClase.findUnique.mockResolvedValue(construir());
        prisma.cursoAsistencias.create.mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError('duplicado', {
                code: 'P2002',
                clientVersion: 'test',
            }),
        );
        prisma.cursoAsistencias.findUnique.mockResolvedValue({
            fechaHoraRegistro: vieja,
        });

        const resultado = await service.registrarAsistenciaQr(
            7,
            TOKEN,
            '203.0.113.8',
            user,
            AHORA,
        );

        expect(resultado.duplicada).toBe(true);
        expect(resultado.fechaHoraRegistro).toBe(vieja.toISOString());
        expect(resultado).not.toHaveProperty('gamificacion');
    });
});

describe('MobileClassesController', () => {
    it('exige token móvil y deja el registro en 200', () => {
        expect(Reflect.getMetadata(PATH_METADATA, MobileClassesController)).toBe(
            'mobile/companies/:companyId/training/classes',
        );
        expect(
            Reflect.getMetadata(GUARDS_METADATA, MobileClassesController),
        ).toEqual(expect.arrayContaining([MobileJwtAuthGuard, CompanyTenantGuard]));
        const proto = MobileClassesController.prototype;
        expect(Reflect.getMetadata(PATH_METADATA, proto.listar)).toBe('/');
        expect(Reflect.getMetadata(METHOD_METADATA, proto.listar)).toBe(
            RequestMethod.GET,
        );
        expect(Reflect.getMetadata(PATH_METADATA, proto.registrar)).toBe(
            'attendance',
        );
        expect(Reflect.getMetadata(METHOD_METADATA, proto.registrar)).toBe(
            RequestMethod.POST,
        );
        expect(Reflect.getMetadata('__httpCode__', proto.registrar)).toBe(200);
    });

    it('toma la IP del request y no acepta un QR vacío ni una fecha mal formada', async () => {
        const training = {
            listarClases: jest.fn().mockResolvedValue([]),
            registrarAsistenciaQr: jest.fn().mockResolvedValue({ registrada: true }),
        };
        const controller = new MobileClassesController(training as any);
        await controller.registrar(7, { codigo: TOKEN }, user, {
            ip: '203.0.113.8',
            headers: {},
        } as any);

        expect(training.registrarAsistenciaQr).toHaveBeenCalledWith(
            7,
            TOKEN,
            '203.0.113.8',
            user,
        );
        const pipe = new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        });
        await expect(
            pipe.transform(
                { codigo: '' },
                { type: 'body', metatype: RegistrarAsistenciaQrDto, data: undefined },
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            pipe.transform(
                { desde: 'ayer' },
                { type: 'query', metatype: RangoClasesQuery, data: undefined },
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
