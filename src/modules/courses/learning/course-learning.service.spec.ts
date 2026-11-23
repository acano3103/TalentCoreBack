import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CourseLearningService } from './course-learning.service';
import { RegisterActivityDto } from './dto/register-activity.dto';

const user = {
    id: 3,
    uuid: 'user-3',
    idTenant: 1,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'López',
} as ActiveUserDto;

const inicio = new Date('2020-01-01T00:00:00.000Z');
const fin = new Date('2099-01-01T00:00:00.000Z');

describe('CourseLearningService web', () => {
    it('findMyCourses sigue pidiendo solo asíncronos y conserva el contrato', async () => {
        const prisma = {
            auth_user: {
                findUnique: jest.fn().mockResolvedValue({ Empleados: [{ idEmpleado: 50 }] }),
            },
            cursoParticipantes: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        idParticipante: 10,
                        estatusAsignacion: 'inscrito',
                        calificacionFinal: 88.5,
                        CursoLeccionProgresos: [{ idLeccion: 1, calificacionQuiz: 80, fechaCompletado: inicio }],
                        CursoSesiones: {
                            idSesion: 4,
                            estatus: 'en_curso',
                            fechaInicioPeriodo: inicio,
                            fechaFinPeriodo: fin,
                            CatCursos: { idTenant: 1, Descripcion: 'Inducción', calificacionAprobatoria: 80 },
                            CursoContenidos: {
                                idTenant: 1,
                                activo: true,
                                CursoModulos: [{ CursoLecciones: [{ idLeccion: 1 }, { idLeccion: 2 }] }],
                            },
                        },
                    },
                ]),
            },
        };
        const service = new CourseLearningService(prisma as any, {} as any);

        const cursos = await service.findMyCourses(7, user);

        expect(prisma.cursoParticipantes.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    idEmpleado: 50,
                    CursoSesiones: expect.objectContaining({
                        idEmpresa: 7,
                        modalidad: 'online_asincrono',
                        estatus: { not: 'cancelado' },
                    }),
                }),
            }),
        );
        expect(cursos).toEqual([
            {
                idSesion: 4,
                idParticipante: 10,
                nombreCurso: 'Inducción',
                fechaInicioPeriodo: inicio,
                fechaFinPeriodo: fin,
                estatusSesion: 'en_curso',
                disponible: true,
                motivoNoDisponible: null,
                estatusAsignacion: 'inscrito',
                calificacionFinal: 88.5,
                calificacionAprobatoria: 80,
                leccionesCompletadas: 1,
                totalLecciones: 2,
                porcentajeAvance: 50,
            },
        ]);
        expect(cursos[0]).not.toHaveProperty('modalidad');
        expect(cursos[0]).not.toHaveProperty('vencimiento');
    });

    it('findMyCourse abre el quiz sin correctIndex ni explanation', async () => {
        const prisma = {
            auth_user: {
                findUnique: jest.fn().mockResolvedValue({ Empleados: [{ idEmpleado: 50 }] }),
            },
            cursoParticipantes: {
                findFirst: jest.fn().mockResolvedValue({
                    idParticipante: 10,
                    estatusAsignacion: 'inscrito',
                    calificacionFinal: null,
                    CursoSesiones: {
                        idSesion: 4,
                        estatus: 'en_curso',
                        fechaInicioPeriodo: inicio,
                        fechaFinPeriodo: fin,
                        CatCursos: { idTenant: 1, Descripcion: 'Inducción', calificacionAprobatoria: 70 },
                    },
                }),
            },
            cursoContenidos: {
                findFirst: jest.fn().mockResolvedValue({
                    tipoContenido: 'nativo',
                    modoAvance: 'libre',
                    estructuraIa: { description: 'Texto largo', targetAudience: 'Todos', level: 'Básico' },
                    CursoModulos: [
                        {
                            idCursoModulo: 1,
                            titulo: 'Módulo',
                            objetivo: 'Objetivo',
                            orden: 1,
                            CursoLecciones: [
                                {
                                    idLeccion: 9,
                                    titulo: 'Lección',
                                    objetivo: 'Objetivo',
                                    orden: 1,
                                    slides: [{ index: 1, title: 'Intro', body: 'Hola', type: 'intro' }],
                                    quiz: [{ question: '¿Color?', options: ['Rojo', 'Azul'], correctIndex: 1, explanation: 'Porque sí' }],
                                    materiales: [{ id: 'm1', tipo: 'archivo', nombre: 'Guía.pdf', archivo: 'guia.pdf' }],
                                },
                            ],
                        },
                    ],
                }),
            },
            cursoLeccionProgresos: { findMany: jest.fn().mockResolvedValue([]) },
        };
        const service = new CourseLearningService(prisma as any, {} as any);

        const curso = (await service.findMyCourse(7, 4, user)) as any;
        const leccion = curso.contenido!.modulos[0].lecciones[0];

        expect(prisma.cursoParticipantes.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    CursoSesiones: expect.objectContaining({ modalidad: 'online_asincrono' }),
                }),
            }),
        );
        expect(leccion.quiz).toEqual([{ question: '¿Color?', options: ['Rojo', 'Azul'] }]);
        expect(leccion.slides).toHaveLength(1);
        expect(leccion.materiales).toEqual([{ id: 'm1', tipo: 'archivo', nombre: 'Guía.pdf', archivo: 'guia.pdf' }]);
        expect(leccion.urlVideo).toBeNull();
        expect(leccion.requiereVideo).toBe(false);
        expect(leccion.progreso.videoVisto).toBe(false);
        expect(JSON.stringify(curso)).not.toContain('correctIndex');
        expect(JSON.stringify(curso)).not.toContain('explanation');
        expect(JSON.stringify(curso)).not.toContain('Porque sí');
    });

    it('findMyCourse responde 404 si el empleado no está inscrito', async () => {
        const prisma = {
            auth_user: { findUnique: jest.fn().mockResolvedValue({ Empleados: [{ idEmpleado: 50 }] }) },
            cursoParticipantes: { findFirst: jest.fn().mockResolvedValue(null) },
        };
        const service = new CourseLearningService(prisma as any, {} as any);
        await expect(service.findMyCourse(7, 4, user)).rejects.toBeInstanceOf(NotFoundException);
    });
});

const ARCHIVO_VIDEO = '3f1c2a4b-5d6e-4789-a012-3456789abcde.mp4';

function leccionVideo(extra: Record<string, unknown> = {}) {
    return {
        idLeccion: 9,
        titulo: 'Lección',
        objetivo: null,
        orden: 0,
        slides: [],
        quiz: [],
        materiales: [],
        urlVideo: 'https://cdn.example.com/leccion.mp4',
        estatusVideo: 'listo',
        ...extra,
    };
}

function armarPlayer(modo: string, leccion: Record<string, unknown> = leccionVideo(), progresos: any[] = []) {
    const prisma = {
        auth_user: { findUnique: jest.fn().mockResolvedValue({ Empleados: [{ idEmpleado: 50 }] }) },
        cursoParticipantes: {
            findFirst: jest.fn().mockResolvedValue({
                idParticipante: 10,
                estatusAsignacion: 'inscrito',
                calificacionFinal: null,
                CursoSesiones: {
                    idSesion: 4,
                    estatus: 'en_curso',
                    fechaInicioPeriodo: inicio,
                    fechaFinPeriodo: fin,
                    CatCursos: { idTenant: 1, Descripcion: 'Inducción', calificacionAprobatoria: 70 },
                },
            }),
            update: jest.fn().mockResolvedValue({}),
        },
        cursoContenidos: {
            findFirst: jest.fn().mockResolvedValue({
                tipoContenido: 'nativo',
                modoAvance: modo,
                estructuraIa: {},
                CursoModulos: [{ idCursoModulo: 1, titulo: 'Módulo', objetivo: null, orden: 0, CursoLecciones: [leccion] }],
            }),
        },
        cursoLeccionProgresos: {
            findMany: jest.fn().mockResolvedValue(progresos),
            upsert: jest.fn().mockResolvedValue({ idLeccion: 9, calificacionQuiz: null, fechaCompletado: new Date() }),
        },
        historicoMovimientos: { create: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };
    const tracking = {
        touchActivity: jest.fn().mockResolvedValue(undefined),
        recordQuizAttempt: jest.fn().mockResolvedValue(undefined),
        logEvent: jest.fn().mockResolvedValue(undefined),
        registerCourseEnd: jest.fn().mockResolvedValue(undefined),
        registerLessonOpen: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CourseLearningService(prisma as any, tracking as any);
    return { prisma, tracking, service };
}

describe('CourseLearningService video', () => {
    it('entrega la URL reproducible y solo exige el video cuando el modo y el archivo están listos', async () => {
        const { service, prisma } = armarPlayer('video_completo');
        prisma.cursoContenidos.findFirst.mockResolvedValue({
            tipoContenido: 'nativo',
            modoAvance: 'video_completo',
            estructuraIa: {},
            CursoModulos: [
                {
                    idCursoModulo: 1,
                    titulo: 'Módulo',
                    objetivo: null,
                    orden: 0,
                    CursoLecciones: [
                        leccionVideo({ idLeccion: 1, urlVideo: 'https://cdn.example.com/clase.mp4' }),
                        leccionVideo({ idLeccion: 2, urlVideo: ARCHIVO_VIDEO }),
                        leccionVideo({ idLeccion: 3, urlVideo: 'https://cdn.example.com/pendiente.mp4', estatusVideo: 'pendiente' }),
                    ],
                },
            ],
        });
        prisma.cursoLeccionProgresos.findMany.mockResolvedValue([
            { idLeccion: 1, calificacionQuiz: null, fechaCompletado: null, videoVisto: true },
        ]);

        const curso = (await service.findMyCourse(7, 4, user)) as any;
        const lecciones = curso.contenido.modulos[0].lecciones;

        expect(lecciones[0].urlVideo).toBe('https://cdn.example.com/clase.mp4');
        expect(lecciones[0].requiereVideo).toBe(true);
        expect(lecciones[0].progreso.videoVisto).toBe(true);
        expect(lecciones[1].urlVideo).toBe(`companies/7/my-courses/4/materials/${ARCHIVO_VIDEO}`);
        expect(lecciones[1].requiereVideo).toBe(true);
        expect(lecciones[1].progreso.videoVisto).toBe(false);
        expect(lecciones[2].urlVideo).toBeNull();
        expect(lecciones[2].requiereVideo).toBe(false);
    });

    it.each(['libre', 'aprobar_quiz'])('el modo %s con video listo no lo exige para completar', async (modo) => {
        const { service, prisma } = armarPlayer(modo);
        const curso = (await service.findMyCourse(7, 4, user)) as any;
        expect(curso.contenido.modulos[0].lecciones[0].urlVideo).toBe('https://cdn.example.com/leccion.mp4');
        expect(curso.contenido.modulos[0].lecciones[0].requiereVideo).toBe(false);

        const resultado = await service.submitLessonProgress(7, 4, 9, {}, user);
        expect(resultado.leccionCompletada).toBe(true);
        expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('video_completo sin haber visto el video responde VIDEO_PENDIENTE', async () => {
        const { service, prisma } = armarPlayer('video_completo');

        await expect(service.submitLessonProgress(7, 4, 9, {}, user)).rejects.toMatchObject({
            response: { code: 'VIDEO_PENDIENTE', message: 'Termina de ver el video para completar la lección.' },
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('con video_completo, 89 % no alcanza y 90 % deja completar la lección', async () => {
        const { service, prisma, tracking } = armarPlayer('video_completo');
        const actividad = { tipo: 'video_progreso' as const, idLeccion: 9, duracionSegundos: 100 };

        await service.registerActivity(7, 4, { ...actividad, segundosVistos: 89 }, user);
        expect(tracking.touchActivity).toHaveBeenCalledTimes(1);
        expect(prisma.cursoLeccionProgresos.upsert).not.toHaveBeenCalled();
        await expect(service.submitLessonProgress(7, 4, 9, {}, user)).rejects.toMatchObject({
            response: { code: 'VIDEO_PENDIENTE' },
        });

        const avance = await service.registerActivity(7, 4, { ...actividad, segundosVistos: 90 }, user);
        expect(avance).toEqual({ registrado: true, videoVisto: true });
        expect(prisma.cursoLeccionProgresos.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({ idLeccion: 9, videoVisto: true }),
                update: expect.objectContaining({ videoVisto: true }),
            }),
        );

        prisma.cursoLeccionProgresos.findMany.mockResolvedValue([
            { idProgreso: 1, idLeccion: 9, videoVisto: true, calificacionQuiz: null, fechaCompletado: null },
        ]);
        const resultado = await service.submitLessonProgress(7, 4, 9, {}, user);
        expect(resultado.leccionCompletada).toBe(true);
    });

    it('rechaza segundos negativos o muy por encima de la duración', async () => {
        const { service, tracking, prisma } = armarPlayer('video_completo');
        const base = { tipo: 'video_progreso' as const, idLeccion: 9, duracionSegundos: 100 };

        await expect(service.registerActivity(7, 4, { ...base, segundosVistos: -1 }, user)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.registerActivity(7, 4, { ...base, segundosVistos: 106 }, user)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.registerActivity(7, 4, { ...base, segundosVistos: 1.5 }, user)).rejects.toBeInstanceOf(BadRequestException);
        expect(tracking.touchActivity).not.toHaveBeenCalled();
        expect(prisma.cursoLeccionProgresos.upsert).not.toHaveBeenCalled();

        await expect(service.registerActivity(7, 4, { ...base, segundosVistos: 105 }, user)).resolves.toMatchObject({ videoVisto: true });
    });

    it('un video que aún no está listo no bloquea video_completo ni video_y_quiz', async () => {
        for (const modo of ['video_completo', 'video_y_quiz']) {
            const { service } = armarPlayer(modo, leccionVideo({ estatusVideo: 'generando' }));
            const resultado = await service.submitLessonProgress(7, 4, 9, {}, user);
            expect(resultado.leccionCompletada).toBe(true);
        }
    });

    it('el DTO acepta video_progreso y rechaza valores inválidos', async () => {
        const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
        const meta = { type: 'body' as const, metatype: RegisterActivityDto };

        await expect(
            pipe.transform({ tipo: 'video_progreso', idLeccion: 9, segundosVistos: 90, duracionSegundos: 100 }, meta),
        ).resolves.toEqual({ tipo: 'video_progreso', idLeccion: 9, segundosVistos: 90, duracionSegundos: 100 });
        await expect(
            pipe.transform({ tipo: 'video_progreso', idLeccion: 9, segundosVistos: -1, duracionSegundos: 100 }, meta),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            pipe.transform({ tipo: 'video_progreso', idLeccion: 9, segundosVistos: 200, duracionSegundos: 10 }, meta),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
