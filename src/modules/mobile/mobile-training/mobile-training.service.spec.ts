import { NotFoundException } from '@nestjs/common';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CourseLearningService } from 'src/modules/courses/learning/course-learning.service';
import { MobileTrainingService } from './mobile-training.service';

function estadoBase() {
    return {
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
    };
}

function gamificacionFalsa() {
    const estado = estadoBase();
    return {
        calcular: jest.fn().mockResolvedValue(estado),
        panorama: jest
            .fn()
            .mockResolvedValue({ estado, horasAnio: 1.5, anio: 2026 }),
        sincronizarInsignias: jest.fn().mockResolvedValue([]),
        estadisticas: jest.fn(),
        marcarVistas: jest.fn().mockResolvedValue({ actualizados: 0 }),
    };
}

const user = {
    id: 3,
    uuid: 'user-3',
    idTenant: 1,
    username: 'ana',
    first_name: 'Ana',
    last_name: 'López',
} as ActiveUserDto;

const AHORA = new Date('2026-11-20T18:00:00.000Z');
const INICIO = new Date('2026-11-01T15:00:00.000Z');
const FIN_HOY = new Date('2026-11-21T05:30:00.000Z');
const FIN_7 = new Date('2026-11-28T02:00:00.000Z');
const FIN_VIGENTE = new Date('2026-11-29T18:00:00.000Z');
const FIN_PASADO = new Date('2026-11-10T18:00:00.000Z');

function clase(id: number, estatus: string, asistencia: Date | null) {
    return {
        idFechaClase: id,
        tituloClase: `Clase ${id}`,
        estatus,
        fechaHoraInicio: new Date('2026-11-02T15:00:00.000Z'),
        fechaHoraFin: new Date('2026-11-02T17:00:00.000Z'),
        CursoAsistencias: asistencia ? [{ fechaHoraRegistro: asistencia }] : [],
    };
}

function participacion(opts: {
    idSesion: number;
    modalidad: 'online_asincrono' | 'presencial' | 'online_sincrono';
    nombre: string;
    estatus?: string | null;
    estatusSesion?: string;
    fin?: Date | null;
    completadas?: number;
    totalLecciones?: number;
    clases?: any[];
    actividad?: Date | null;
    tenant?: number | null;
    minimo?: number;
    tipo?: 'scorm' | 'nativo' | 'ia';
    sinContenido?: boolean;
}) {
    const total =
        opts.totalLecciones ??
        (opts.modalidad === 'online_asincrono' && !opts.sinContenido ? 2 : 0);
    const lecciones = Array.from({ length: total }, (_, i) => ({
        idLeccion: opts.idSesion * 100 + i + 1,
    }));
    const tenant = opts.tenant === undefined ? 1 : opts.tenant;
    return {
        idParticipante: opts.idSesion * 10,
        estatusAsignacion: opts.estatus === undefined ? 'inscrito' : opts.estatus,
        calificacionFinal: null,
        CursoLeccionProgresos: lecciones
            .slice(0, opts.completadas ?? 0)
            .map((leccion) => ({
                idLeccion: leccion.idLeccion,
                fechaCompletado: new Date('2026-11-15T18:00:00.000Z'),
            })),
        CursoSeguimientoParticipante: opts.actividad
            ? { fechaUltimaActividad: opts.actividad }
            : null,
        CursoSesiones: {
            idSesion: opts.idSesion,
            modalidad: opts.modalidad,
            estatus: opts.estatusSesion ?? 'en_curso',
            fechaInicioPeriodo: INICIO,
            fechaFinPeriodo: opts.fin === undefined ? FIN_VIGENTE : opts.fin,
            porcentajeAsistenciaMinimo: opts.minimo ?? 80,
            CatCursos: {
                idTenant: tenant,
                Descripcion: opts.nombre,
                calificacionAprobatoria: 70,
            },
            CursoContenidos:
                opts.modalidad === 'online_asincrono' && !opts.sinContenido
                    ? {
                            idTenant: tenant,
                            activo: true,
                            tipoContenido: opts.tipo ?? 'nativo',
                            modoAvance: 'libre',
                            CursoModulos: [{ CursoLecciones: lecciones }],
                        }
                    : null,
            CursoFechasClase: opts.clases ?? [],
        },
    };
}

function armar(filas: any[]) {
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
            findFirst: jest.fn().mockResolvedValue(filas[0] ?? null),
        },
        cursoLecciones: { findMany: jest.fn().mockResolvedValue([]) },
        cursoContenidos: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const learning = new CourseLearningService({} as any, {} as any);
    const crypto = { decrypt: jest.fn(), encrypt: jest.fn() };
    const gamificacion = gamificacionFalsa();
    const scorm = { commit: jest.fn() };
    const career = {
        resumenEmpleado: jest.fn().mockResolvedValue(null),
        findPlanesEmpleado: jest.fn().mockResolvedValue({ planes: [] }),
    };
    const service = new MobileTrainingService(
        prisma as any,
        learning,
        crypto as any,
        gamificacion as any,
        scorm as any,
        career as any,
    );
    return { prisma, learning, service, gamificacion, scorm, career };
}

const catalogo = [
    participacion({
        idSesion: 10,
        modalidad: 'presencial',
        nombre: 'Hoy',
        fin: FIN_HOY,
    }),
    participacion({
        idSesion: 15,
        modalidad: 'online_asincrono',
        nombre: 'Sin contenido',
        fin: FIN_HOY,
        sinContenido: true,
    }),
    participacion({
        idSesion: 20,
        modalidad: 'online_sincrono',
        nombre: 'Siete días',
        fin: FIN_7,
        clases: [
            clase(1, 'completada', new Date('2026-11-18T15:00:00.000Z')),
            clase(2, 'programada', null),
        ],
    }),
    participacion({
        idSesion: 31,
        modalidad: 'online_asincrono',
        nombre: 'Nativo',
        tipo: 'nativo',
        completadas: 1,
        actividad: new Date('2026-11-18T16:00:00.000Z'),
    }),
    participacion({
        idSesion: 30,
        modalidad: 'online_asincrono',
        nombre: 'IA',
        tipo: 'ia',
        completadas: 1,
        actividad: new Date('2026-11-10T16:00:00.000Z'),
    }),
    participacion({
        idSesion: 40,
        modalidad: 'presencial',
        nombre: 'Sin fecha',
        fin: null,
    }),
    participacion({
        idSesion: 50,
        modalidad: 'online_asincrono',
        nombre: 'Hecho',
        estatus: 'completado',
        fin: FIN_PASADO,
        tipo: 'scorm',
        completadas: 2,
    }),
    participacion({
        idSesion: 60,
        modalidad: 'online_sincrono',
        nombre: 'Venció',
        fin: FIN_PASADO,
    }),
    participacion({
        idSesion: 70,
        modalidad: 'presencial',
        nombre: 'Reprobado',
        estatus: 'reprobado',
        fin: FIN_PASADO,
    }),
    participacion({
        idSesion: 80,
        modalidad: 'presencial',
        nombre: 'Otro tenant',
        tenant: 9,
    }),
    participacion({
        idSesion: 90,
        modalidad: 'presencial',
        nombre: 'Cancelado',
        estatusSesion: 'cancelado',
    }),
];

describe('MobileTrainingService', () => {
    it('lista las tres modalidades y cada estado de vencimiento, sin cancelados ni otro tenant', async () => {
        const { prisma, service } = armar(catalogo);
        const lista = await service.listar(7, user, 'todos', AHORA);
        const porId = Object.fromEntries(
            lista.map((curso) => [curso.idSesion, curso]),
        );

        expect(prisma.cursoParticipantes.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    idEmpleado: 50,
                    CursoSesiones: { idEmpresa: 7, estatus: { not: 'cancelado' } },
                },
            }),
        );
        expect(lista.map((curso) => curso.idSesion)).toEqual([
            10, 15, 20, 31, 30, 40, 50, 60, 70,
        ]);
        expect(new Set(lista.map((curso) => curso.modalidad))).toEqual(
            new Set(['presencial', 'online_sincrono', 'online_asincrono']),
        );
        expect(porId[10].vencimiento).toEqual({ estado: 'por_vencer', dias: 0 });
        expect(porId[20].vencimiento).toEqual({ estado: 'por_vencer', dias: 7 });
        expect(porId[31].vencimiento).toEqual({ estado: 'vigente', dias: 9 });
        expect(porId[40].vencimiento).toEqual({ estado: 'sin_fecha', dias: null });
        expect(porId[50].vencimiento).toEqual({ estado: 'completado', dias: null });
        expect(porId[60].vencimiento).toEqual({ estado: 'vencido', dias: null });
        expect(porId[31].tipoContenido).toBe('nativo');
        expect(porId[30].tipoContenido).toBe('ia');
        expect(porId[50].tipoContenido).toBe('scorm');
        expect(porId[10].tipoContenido).toBeNull();
        expect(porId[10].asistencia).toEqual({
            asistidas: 0,
            total: 0,
            porcentajeMinimo: 80,
        });
        expect(porId[31].asistencia).toBeNull();
        expect(porId[20].porcentajeAvance).toBe(50);
        expect(porId[20].asistencia).toEqual({
            asistidas: 1,
            total: 2,
            porcentajeMinimo: 80,
        });
        expect(porId[15].disponible).toBe(false);
        expect(porId[15].motivoNoDisponible).toBe(
            'El curso aún no tiene contenido.',
        );
        expect(porId[60].disponible).toBe(true);
    });

    it('cada filtro respeta la definición de la web y el mismo orden', async () => {
        const { service } = armar(catalogo);
        const ids = async (
            filtro:
                | 'todos'
                | 'pendientes'
                | 'en_progreso'
                | 'por_vencer'
                | 'completados'
                | 'no_realizados',
        ) =>
            (await service.listar(7, user, filtro, AHORA)).map(
                (curso) => curso.idSesion,
            );

        expect(await ids('pendientes')).toEqual([10, 15, 20, 31, 30, 40]);
        expect(await ids('en_progreso')).toEqual([20, 31, 30]);
        expect(await ids('por_vencer')).toEqual([10, 20]);
        expect(await ids('completados')).toEqual([50]);
        expect(await ids('no_realizados')).toEqual([60]);
    });

    it('el avance presencial es clases asistidas entre clases no canceladas', async () => {
        const fila = participacion({
            idSesion: 100,
            modalidad: 'presencial',
            nombre: 'Taller',
            minimo: 75,
            clases: [
                clase(1, 'completada', new Date('2026-11-01T15:00:00.000Z')),
                clase(2, 'programada', new Date('2026-11-10T15:00:00.000Z')),
                clase(3, 'programada', null),
                clase(4, 'cancelada', new Date('2026-11-18T15:00:00.000Z')),
            ],
        });
        const { service } = armar([fila]);
        const [curso] = await service.listar(7, user, 'todos', AHORA);

        expect(curso.leccionesCompletadas).toBe(2);
        expect(curso.totalLecciones).toBe(3);
        expect(curso.porcentajeAvance).toBe(67);
        expect(curso.asistencia).toEqual({
            asistidas: 2,
            total: 3,
            porcentajeMinimo: 75,
        });
        expect(curso.ultimaActividad).toBe('2026-11-18T15:00:00.000Z');
    });

    it('un usuario sin empleado en la empresa recibe 404', async () => {
        const { prisma, service } = armar(catalogo);
        prisma.auth_user.findUnique.mockResolvedValue({ Empleados: [] });

        await expect(
            service.listar(7, user, 'todos', AHORA),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.auth_user.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                include: expect.objectContaining({
                    Empleados: expect.objectContaining({
                        where: { idEmpresa: 7, idTenant: 1 },
                    }),
                }),
            }),
        );
    });

    it('el detalle presencial trae clases con asistencia y sin registro', async () => {
        const fila = participacion({
            idSesion: 100,
            modalidad: 'presencial',
            nombre: 'Taller',
            clases: [
                clase(1, 'completada', new Date('2026-11-01T15:00:00.000Z')),
                clase(2, 'programada', null),
            ],
        });
        const { service, learning } = armar([fila]);
        const abrir = jest.spyOn(learning, 'findMyCourse');

        const detalle = (await service.detalle(7, 100, user, AHORA)) as any;

        expect(abrir).not.toHaveBeenCalled();
        expect(detalle.contenido).toBeNull();
        expect(detalle.modalidad).toBe('presencial');
        expect(detalle.clases.map((clase) => clase.asistencia.registrada)).toEqual([
            true,
            false,
        ]);
        expect(detalle.clases.map((clase) => clase.numero)).toEqual([1, 2]);
        expect(
            detalle.clases.every(
                (clase) => clase.totalClases === 2 && clase.puedeRegistrar === false,
            ),
        ).toBe(true);
    });

    it('el detalle asíncrono numera lecciones, estima la duración y no manda respuestas', async () => {
        const fila = participacion({
            idSesion: 31,
            modalidad: 'online_asincrono',
            nombre: 'Nativo',
            tipo: 'nativo',
        });
        const { prisma, service, learning } = armar([fila]);
        jest.spyOn(learning, 'findMyCourse').mockResolvedValue({
            idSesion: 31,
            nombreCurso: 'Nativo',
            contenido: {
                descripcion: 'Narrativa del curso',
                modulos: [
                    {
                        lecciones: [
                            {
                                idLeccion: 1,
                                quiz: [
                                    {
                                        question: '¿Q?',
                                        options: ['a', 'b'],
                                        correctIndex: 1,
                                        explanation: 'secreto',
                                    },
                                ],
                                materiales: [{ nombre: 'Guía' }],
                                slides: [{}],
                            },
                        ],
                    },
                    {
                        lecciones: [
                            { idLeccion: 2, quiz: [], materiales: [], slides: [] },
                            { idLeccion: 3, quiz: [], materiales: null, slides: [] },
                        ],
                    },
                ],
            },
        } as any);
        prisma.cursoLecciones.findMany.mockResolvedValue([
            { slides: [{}], quiz: [{}] },
        ]);

        const detalle = (await service.detalle(7, 31, user, AHORA)) as any;
        const lecciones = detalle.contenido.modulos.flatMap(
            (modulo) => modulo.lecciones,
        );

        expect(detalle.modalidad).toBe('online_asincrono');
        expect(detalle.descripcion).toBe('Narrativa del curso');
        expect(detalle.duracionEstimadaMin).toBe(2);
        expect(detalle.vencimiento).toEqual({ estado: 'vigente', dias: 9 });
        expect(lecciones.map((leccion) => leccion.numero)).toEqual([
            '1.1',
            '2.1',
            '2.2',
        ]);
        expect(lecciones[0].quiz).toEqual([
            { question: '¿Q?', options: ['a', 'b'] },
        ]);
        expect(lecciones[0].urlVideo).toBeNull();
        expect(lecciones[0].requiereVideo).toBe(false);
        expect(lecciones[0].materiales).toEqual([{ nombre: 'Guía' }]);
        expect(lecciones[2].materiales).toEqual([]);
        expect(JSON.stringify(detalle)).not.toContain('correctIndex');
        expect(JSON.stringify(detalle)).not.toContain('secreto');
    });

    it('el detalle asíncrono reescribe el video propio a la URL móvil y conserva el externo', async () => {
        const archivo = '3f1c2a4b-5d6e-4789-a012-3456789abcde.mp4';
        const fila = participacion({
            idSesion: 31,
            modalidad: 'online_asincrono',
            nombre: 'Nativo',
            tipo: 'nativo',
        });
        const { service, learning } = armar([fila]);
        jest.spyOn(learning, 'findMyCourse').mockResolvedValue({
            idSesion: 31,
            nombreCurso: 'Nativo',
            contenido: {
                descripcion: 'Narrativa del curso',
                modulos: [
                    {
                        lecciones: [
                            {
                                idLeccion: 1,
                                quiz: [],
                                materiales: [],
                                slides: [],
                                urlVideo: `companies/7/my-courses/31/materials/${archivo}`,
                                requiereVideo: true,
                                progreso: {
                                    completada: false,
                                    calificacionQuiz: null,
                                    fechaCompletado: null,
                                    videoVisto: false,
                                },
                            },
                            {
                                idLeccion: 2,
                                quiz: [],
                                materiales: [],
                                slides: [],
                                urlVideo: 'https://cdn.example.com/clase.mp4',
                                requiereVideo: true,
                                progreso: {
                                    completada: false,
                                    calificacionQuiz: null,
                                    fechaCompletado: null,
                                    videoVisto: true,
                                },
                            },
                        ],
                    },
                ],
            },
        } as any);

        const detalle = (await service.detalle(7, 31, user, AHORA)) as any;
        const lecciones = detalle.contenido.modulos.flatMap(
            (modulo) => modulo.lecciones,
        );

        expect(lecciones[0].urlVideo).toBe(
            `mobile/companies/7/training/courses/31/materials/${archivo}`,
        );
        expect(lecciones[0].requiereVideo).toBe(true);
        expect(lecciones[0].progreso.videoVisto).toBe(false);
        expect(lecciones[1].urlVideo).toBe('https://cdn.example.com/clase.mp4');
        expect(lecciones[1].progreso.videoVisto).toBe(true);
    });

    it('quien no está inscrito recibe CURSO_NO_ASIGNADO', async () => {
        const { service } = armar([]);
        await expect(service.detalle(7, 4, user, AHORA)).rejects.toMatchObject({
            response: { code: 'CURSO_NO_ASIGNADO' },
        });
    });

    it('delegar el avance agrega la gamificación y la actividad conserva la respuesta del player', async () => {
        const { service, learning, gamificacion } = armar([]);
        const progreso = { idLeccion: 3, aprobada: true };
        const actividad = { registrado: true };
        const antes = {
            ...estadoBase(),
            conteos: {
                lecciones: 0,
                quizzes: 0,
                quizzesPrimera: 0,
                cursos: 0,
                cursosATiempo: 0,
                asistencias: 0,
            },
        };
        const despues = {
            ...estadoBase(),
            xp: 190,
            conteos: {
                lecciones: 1,
                quizzes: 1,
                quizzesPrimera: 1,
                cursos: 1,
                cursosATiempo: 1,
                asistencias: 0,
            },
            nivel: {
                numero: 1,
                nombre: 'Explorador',
                xp: 190,
                xpDesde: 0,
                xpSiguiente: 300,
            },
        };
        gamificacion.calcular
            .mockResolvedValueOnce(antes)
            .mockResolvedValueOnce(despues);
        jest
            .spyOn(learning, 'submitLessonProgress')
            .mockResolvedValue(progreso as any);
        jest
            .spyOn(learning, 'registerActivity')
            .mockResolvedValue(actividad as any);

        const guardado = await service.guardarAvance(
            7,
            4,
            3,
            { answers: [1] },
            user,
        );
        expect(guardado).toMatchObject(progreso);
        expect(guardado?.gamificacion.xpGanado).toEqual({
            total: 190,
            conceptos: [
                { concepto: 'Lección completada', xp: 10 },
                { concepto: 'Quiz aprobado', xp: 20 },
                { concepto: 'Bono: quiz aprobado a la primera', xp: 10 },
                { concepto: 'Curso aprobado', xp: 100 },
                { concepto: 'Bono: curso terminado a tiempo', xp: 50 },
            ],
        });
        expect(guardado?.gamificacion.nivelAntes).toBe(1);
        await expect(
            service.registrarActividad(7, 4, { tipo: 'latido' }, user),
        ).resolves.toBe(actividad);
    });

    it('si el player dice que no está asignado, la app responde CURSO_NO_ASIGNADO y deja intacto otro 404', async () => {
        const { service, learning } = armar([]);
        jest
            .spyOn(learning, 'submitLessonProgress')
            .mockRejectedValueOnce(
                new NotFoundException('No tienes asignado el curso de la sesión #4.'),
            )
            .mockRejectedValueOnce(
                new NotFoundException('La lección #9 no pertenece a este curso.'),
            );

        await expect(
            service.guardarAvance(7, 4, 3, {}, user),
        ).rejects.toMatchObject({
            response: { code: 'CURSO_NO_ASIGNADO' },
        });
        await expect(service.guardarAvance(7, 4, 9, {}, user)).rejects.toThrow(
            'La lección #9 no pertenece a este curso.',
        );
    });

    it('el resumen arma conteos, continuar y la próxima clase con una sola lectura de gamificación', async () => {
        const { service, prisma, gamificacion } = armar(catalogo);
        prisma.cursoContenidos.findFirst.mockResolvedValue({
            CursoModulos: [
                {
                    CursoLecciones: [
                        { idLeccion: 3101, titulo: 'Uno' },
                        { idLeccion: 3102, titulo: 'Dos' },
                    ],
                },
            ],
        });
        const futuro = new Date('2026-11-25T18:00:00.000Z');
        const filas = [...(await prisma.cursoParticipantes.findMany())];
        filas.push(
            participacion({
                idSesion: 21,
                modalidad: 'presencial',
                nombre: 'Siguiente',
                fin: FIN_VIGENTE,
                clases: [
                    {
                        idFechaClase: 21,
                        tituloClase: 'Clase viva',
                        estatus: 'programada',
                        fechaHoraInicio: futuro,
                        fechaHoraFin: new Date('2026-11-25T20:00:00.000Z'),
                        CursoAsistencias: [],
                    },
                ],
            }),
        );
        prisma.cursoParticipantes.findMany.mockResolvedValue(filas);

        const resumen = await service.resumen(7, user, AHORA);

        expect(gamificacion.panorama).toHaveBeenCalledTimes(1);
        expect(resumen.conteos).toEqual({
            pendientes: 7,
            enProgreso: 3,
            porVencer: 2,
            completados: 1,
            noRealizados: 1,
        });
        expect(resumen.porVencer?.idSesion).toBe(10);
        expect(resumen.continuar?.idSesion).toBe(31);
        expect(resumen.continuar?.leccionActual).toEqual({
            idLeccion: 3102,
            numero: '1.2',
            titulo: 'Dos',
        });
        expect(resumen.proximaClase?.idFechaClase).toBe(21);
        expect(resumen.horasAnio).toBe(1.5);
        expect(resumen.planCarrera).toBeNull();
        expect(resumen.cursosRecientes.map((curso) => curso.idSesion)).toEqual([
            10, 15, 20,
        ]);
        expect(resumen.gamificacion.insigniasTotal).toBe(6);
    });

    it('el historial deja fuera los cursos abiertos y pagina del más reciente al más antiguo', async () => {
        const { service, prisma } = armar(catalogo);
        const filas = await prisma.cursoParticipantes.findMany();
        const hecho = filas.find((fila) => fila.CursoSesiones.idSesion === 50);
        hecho.CursoSeguimientoParticipante = {
            fechaUltimaActividad: null,
            fechaConclusion: new Date('2026-11-12T18:00:00.000Z'),
        };
        hecho.calificacionFinal = 100;

        const pagina = await service.historial(7, user, 1, 2, AHORA);

        expect(pagina.total).toBe(3);
        expect(pagina.items.map((item) => item.resultado)).toEqual([
            'aprobado',
            'no_aprobado',
        ]);
        expect(pagina.items[0]).toMatchObject({
            idSesion: 50,
            calificacionFinal: 100,
            fecha: '2026-11-12T18:00:00.000Z',
        });
        const resto = await service.historial(7, user, 2, 2, AHORA);
        expect(resto.items.map((item) => item.idSesion)).toEqual([60]);
        expect(resto.items[0].resultado).toBe('no_realizado');
    });

    it('el commit SCORM solo agrega gamificación cuando cambia el estatus del curso', async () => {
        const { service, prisma, scorm, gamificacion } = armar([]);
        prisma.cursoParticipantes.findFirst.mockResolvedValue({
            estatusAsignacion: 'inscrito',
        });
        scorm.commit.mockResolvedValue({
            guardado: true,
            curso: { estatusAsignacion: 'completado', terminado: true },
        });

        const cambiado = await service.commitScorm(
            7,
            4,
            { valores: {}, terminado: true } as any,
            user,
        );
        expect((cambiado as unknown as { gamificacion: { nivelAntes: number } }).gamificacion.nivelAntes).toBe(1);

        scorm.commit.mockResolvedValue({
            guardado: true,
            curso: { estatusAsignacion: 'inscrito', terminado: false },
        });
        gamificacion.calcular.mockClear();
        const igual = await service.commitScorm(
            7,
            4,
            { valores: {}, terminado: false } as any,
            user,
        );
        expect(igual).not.toHaveProperty('gamificacion');
    });

    it('el resumen incluye el plan de carrera y, si no hay, queda null', async () => {
        const { service, career } = armar([]);
        await expect(service.resumen(7, user, AHORA)).resolves.toMatchObject({
            planCarrera: null,
        });
        expect(career.resumenEmpleado).toHaveBeenCalledWith(7, 50);

        career.resumenEmpleado.mockResolvedValue({
            puestoObjetivo: 'Líder',
            porcentaje: 50,
            estatus: 'en_preparacion',
        });
        const resumen = await service.resumen(7, user, AHORA);
        expect(resumen.planCarrera).toEqual({
            puestoObjetivo: 'Líder',
            porcentaje: 50,
            estatus: 'en_preparacion',
        });
    });

    it('el plan de carrera de la app es el del empleado de la sesión', async () => {
        const { service, career } = armar([]);
        career.findPlanesEmpleado.mockResolvedValue({ planes: [] });
        await expect(service.planCarrera(7, user)).resolves.toEqual({ planes: [] });
        expect(career.findPlanesEmpleado).toHaveBeenCalledWith(7, 50);
    });
});
