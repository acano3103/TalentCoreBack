import { Prisma } from 'generated/prisma/client';
import { GamificacionService } from './gamificacion.service';
import { evaluar, FuentesGamificacion } from './calcular';

function filaCurso(id: number) {
    return {
        idParticipante: id,
        estatusAsignacion: 'inscrito',
        calificacionFinal: null,
        CursoSeguimientoParticipante: {
            fechaConclusion: null,
            tiempoTotalSegundos: 0,
            fechaUltimaActividad: null,
        },
        CursoSesiones: {
            modalidad: 'online_asincrono',
            estatus: 'en_curso',
            fechaFinPeriodo: null,
            CursoFechasClase: [],
        },
    };
}

function servicio(prisma: ReturnType<typeof prismaDe>, completas = 0) {
    const career = {
        contarRutasCompletas: jest.fn().mockResolvedValue(completas),
    };
    return {
        service: new GamificacionService(prisma as any, career as any),
        career,
    };
}

function prismaDe(parcial: {
    participaciones?: any[];
    lecciones?: any[];
    intentos?: any[];
    tiempos?: any[];
    scorm?: any[];
    logros?: any[];
}) {
    return {
        catSites: {
            findFirst: jest
                .fn()
                .mockResolvedValue({ zonaHoraria: 'America/Mexico_City' }),
        },
        cursoParticipantes: {
            findMany: jest.fn().mockResolvedValue(parcial.participaciones ?? []),
        },
        cursoLeccionProgresos: {
            findMany: jest.fn().mockResolvedValue(parcial.lecciones ?? []),
        },
        cursoIntentosQuiz: {
            findMany: jest.fn().mockResolvedValue(parcial.intentos ?? []),
        },
        cursoTiempoDiario: {
            findMany: jest.fn().mockResolvedValue(parcial.tiempos ?? []),
        },
        cursoScormProgresos: {
            findMany: jest.fn().mockResolvedValue(parcial.scorm ?? []),
        },
        cursoLogrosEmpleado: {
            findMany: jest.fn().mockResolvedValue(parcial.logros ?? []),
            create: jest.fn().mockResolvedValue({}),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
    };
}

describe('GamificacionService', () => {
    const ahora = new Date('2026-03-15T18:00:00.000Z');

    it('suma cada concepto una vez y reparte el tiempo anterior al mes de la última actividad', async () => {
        const prisma = prismaDe({
            participaciones: [
                {
                    idParticipante: 5,
                    estatusAsignacion: 'completado',
                    calificacionFinal: 100,
                    CursoSeguimientoParticipante: {
                        fechaConclusion: new Date('2026-03-01T18:00:00.000Z'),
                        tiempoTotalSegundos: 7200,
                        fechaUltimaActividad: new Date('2026-03-01T18:00:00.000Z'),
                    },
                    CursoSesiones: {
                        modalidad: 'presencial',
                        estatus: 'finalizado',
                        fechaFinPeriodo: new Date('2026-03-10T18:00:00.000Z'),
                        CursoFechasClase: [
                            {
                                estatus: 'completada',
                                fechaHoraInicio: new Date('2026-02-01T16:00:00.000Z'),
                                fechaHoraFin: new Date('2026-02-01T17:00:00.000Z'),
                                CursoAsistencias: [
                                    { fechaHoraRegistro: new Date('2026-02-01T16:05:00.000Z') },
                                ],
                            },
                        ],
                    },
                },
            ],
            lecciones: [{ fechaCompletado: new Date('2026-03-01T18:00:00.000Z') }],
            intentos: [
                {
                    idParticipante: 5,
                    idLeccion: 1,
                    numeroIntento: 1,
                    aprobado: true,
                    fechaIntento: new Date('2026-03-01T18:00:00.000Z'),
                },
                {
                    idParticipante: 5,
                    idLeccion: 1,
                    numeroIntento: 2,
                    aprobado: true,
                    fechaIntento: new Date('2026-03-02T18:00:00.000Z'),
                },
            ],
            tiempos: [
                {
                    idParticipante: 5,
                    fecha: new Date('2026-01-15T00:00:00.000Z'),
                    segundos: 3600,
                },
            ],
        });
        const { service } = servicio(prisma);
        const estado = await service.calcular(7, 50, ahora);
        const stats = await service.estadisticas(7, 50, 2026, ahora);

        expect(estado.xp).toBe(210);
        expect(estado.conteos).toEqual({
            lecciones: 1,
            quizzes: 1,
            quizzesPrimera: 1,
            cursos: 1,
            cursosATiempo: 1,
            asistencias: 1,
        });
        expect(stats).toMatchObject({
            anio: 2026,
            horas: 3,
            cursosAprobados: 1,
            calificacionPromedio: 100,
            porcentajeATiempo: 100,
        });
        expect(stats.horasPorMes.find((mes) => mes.mes === 1)?.horas).toBe(1);
        expect(stats.horasPorMes.find((mes) => mes.mes === 2)?.horas).toBe(1);
        expect(stats.horasPorMes.find((mes) => mes.mes === 3)?.horas).toBe(1);
        expect(prisma.cursoIntentosQuiz.findMany).toHaveBeenCalledTimes(2);
        expect(prisma.cursoLeccionProgresos.findMany).toHaveBeenCalledTimes(2);
        expect(prisma.cursoTiempoDiario.findMany).toHaveBeenCalledTimes(2);
        expect(prisma.cursoParticipantes.findMany).toHaveBeenCalledTimes(2);
    });

    it('calcula 50 cursos con una consulta por tabla en menos de 150 ms', async () => {
        const participaciones = Array.from({ length: 50 }, (_, indice) =>
            filaCurso(indice + 1),
        );
        const lecciones = participaciones.flatMap(() =>
            Array.from({ length: 10 }, () => ({
                fechaCompletado: new Date('2026-03-01T18:00:00.000Z'),
            })),
        );
        const prisma = prismaDe({ participaciones, lecciones });
        const { service } = servicio(prisma);
        const inicio = Date.now();
        const estado = await service.calcular(7, 50, ahora);
        expect(Date.now() - inicio).toBeLessThan(150);
        expect(estado.conteos.lecciones).toBe(500);
        expect(prisma.cursoLeccionProgresos.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.cursoIntentosQuiz.findMany).toHaveBeenCalledTimes(1);
    });

    it('inserta cada insignia una sola vez y no la devuelve de nuevo', async () => {
        const prisma = prismaDe({});
        const { service } = servicio(prisma);
        const fuentes: FuentesGamificacion = {
            zona: 'UTC',
            ahora,
            leccionesCompletadas: [],
            intentos: [],
            commitsScorm: [],
            logros: [],
            rutasCompletas: 0,
            cursos: [
                {
                    estatus: 'completado',
                    calificacionFinal: 100,
                    fechaConclusion: new Date('2026-03-01T12:00:00.000Z'),
                    fechaFin: null,
                    modalidad: 'online_asincrono',
                    estatusSesion: 'en_curso',
                    tiempoTotalSegundos: 0,
                    fechaUltimaActividad: null,
                    segundosDiarios: [],
                    clases: [],
                },
            ],
        };
        const estado = evaluar(fuentes);
        const primeras = await service.sincronizarInsignias(
            7,
            50,
            1,
            estado,
            ahora,
        );
        expect(primeras.map((insignia) => insignia.codigo)).toEqual([
            'PRIMER_CURSO',
            'PERFECTO',
        ]);
        expect(
            primeras.every(
                (insignia) =>
                    insignia.ganada &&
                    !insignia.vista &&
                    insignia.fechaObtencion === ahora.toISOString(),
            ),
        ).toBe(true);

        const otraVez = await service.sincronizarInsignias(7, 50, 1, {
            ...estado,
            insignias: estado.insignias.map((insignia) =>
                insignia.ganada
                    ? { ...insignia, fechaObtencion: ahora.toISOString() }
                    : insignia,
            ),
        });
        expect(otraVez).toEqual([]);
        expect(prisma.cursoLogrosEmpleado.create).toHaveBeenCalledTimes(2);

        prisma.cursoLogrosEmpleado.create.mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError('duplicado', {
                code: 'P2002',
                clientVersion: 'test',
            }),
        );
        const carrera = await service.sincronizarInsignias(7, 50, 1, estado, ahora);
        expect(carrera).toEqual([]);
    });

    it('marcar vistas actualiza y un cuerpo vacío no toca la tabla', async () => {
        const prisma = prismaDe({});
        const { service } = servicio(prisma);
        await expect(service.marcarVistas(7, 50, [])).resolves.toEqual({
            actualizados: 0,
        });
        expect(prisma.cursoLogrosEmpleado.updateMany).not.toHaveBeenCalled();
        prisma.cursoLogrosEmpleado.updateMany.mockResolvedValue({ count: 1 });
        await service.marcarVistas(7, 50, ['PRIMER_CURSO', 'PRIMER_CURSO'], ahora);
        expect(prisma.cursoLogrosEmpleado.updateMany).toHaveBeenCalledWith({
            where: { idEmpleado: 50, idEmpresa: 7, codigo: { in: ['PRIMER_CURSO'] } },
            data: { vistoEn: ahora },
        });
    });

    it('una ruta de carrera al 100 % llena el progreso de Ruta completa', async () => {
        const prisma = prismaDe({});
        const { service, career } = servicio(prisma, 1);
        const estado = await service.calcular(7, 50, ahora);
        expect(career.contarRutasCompletas).toHaveBeenCalledWith(7, 50);
        expect(
            estado.insignias.find((insignia) => insignia.codigo === 'RUTA_COMPLETA'),
        ).toMatchObject({
            ganada: true,
            progreso: { actual: 1, meta: 1 },
        });
    });
});
