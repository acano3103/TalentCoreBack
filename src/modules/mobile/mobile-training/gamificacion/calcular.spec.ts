import {
    aTiempo,
    ConteosXp,
    diferenciaXp,
    estadisticasDe,
    evaluar,
    FuentesGamificacion,
    nivelDe,
    xpDe,
} from './calcular';
import { claveSemana, calcularRacha, semanaAnterior } from './semanas';

const CERO: ConteosXp = { lecciones: 0, quizzes: 0, quizzesPrimera: 0, cursos: 0, cursosATiempo: 0, asistencias: 0 };

function fuentes(parcial: Partial<FuentesGamificacion> = {}): FuentesGamificacion {
    return {
        zona: 'UTC',
        ahora: new Date('2026-11-20T12:00:00.000Z'),
        leccionesCompletadas: [],
        intentos: [],
        commitsScorm: [],
        cursos: [],
        logros: [],
        rutasCompletas: 0,
        ...parcial,
    };
}

function curso(parcial: Partial<FuentesGamificacion['cursos'][number]> = {}): FuentesGamificacion['cursos'][number] {
    return {
        estatus: 'inscrito',
        calificacionFinal: null,
        fechaConclusion: null,
        fechaFin: null,
        modalidad: 'online_asincrono',
        estatusSesion: 'en_curso',
        tiempoTotalSegundos: 0,
        fechaUltimaActividad: null,
        segundosDiarios: [],
        clases: [],
        ...parcial,
    };
}

describe('reglas de gamificación', () => {
    it('identifica la semana ISO y el cambio de año', () => {
        expect(claveSemana('2026-11-16')).toBe('2026-W47');
        expect(claveSemana('2026-11-22')).toBe('2026-W47');
        expect(claveSemana('2025-12-28')).toBe('2025-W52');
        expect(claveSemana('2025-12-29')).toBe('2026-W01');
        expect(semanaAnterior('2026-W01')).toBe('2025-W52');
    });

    it('la semana actual vacía no rompe la racha y un hueco sí', () => {
        const hoy = '2026-11-20';
        const actual = claveSemana(hoy);
        const previa = semanaAnterior(actual);
        const anterior = semanaAnterior(previa);
        expect(calcularRacha(new Set([previa, anterior]), hoy)).toMatchObject({ semanas: 2, activaEstaSemana: false });
        expect(calcularRacha(new Set([actual, anterior]), hoy)).toMatchObject({ semanas: 1, activaEstaSemana: true });
        expect(calcularRacha(new Set([actual, previa, anterior]), hoy).semanas).toBe(3);

        const enero = calcularRacha(new Set(['2025-W52', '2026-W01']), '2026-01-02');
        expect(enero).toMatchObject({ semanas: 2, activaEstaSemana: true });
        expect(enero.ultimas8.map((semana) => semana.semana)).toContain('2025-W52');
        expect(enero.ultimas8[7].semana).toBe('2026-W01');
        expect(calcularRacha(new Set(['2025-W52', '2026-W01']), '2026-01-05')).toMatchObject({
            semanas: 2,
            activaEstaSemana: false,
        });
        expect(calcularRacha(new Set(['2025-W52']), '2026-01-05').semanas).toBe(0);
    });

    it('cuenta cada concepto y no repite un quiz aprobado varias veces', () => {
        const estado = evaluar(
            fuentes({
                leccionesCompletadas: [new Date('2026-11-20T12:00:00.000Z')],
                intentos: [
                    { idParticipante: 1, idLeccion: 8, numeroIntento: 1, aprobado: true, fecha: new Date('2026-11-20T12:00:00.000Z') },
                    { idParticipante: 1, idLeccion: 8, numeroIntento: 2, aprobado: true, fecha: new Date('2026-11-20T13:00:00.000Z') },
                    { idParticipante: 1, idLeccion: 8, numeroIntento: 3, aprobado: true, fecha: new Date('2026-11-20T14:00:00.000Z') },
                    { idParticipante: 1, idLeccion: 9, numeroIntento: 1, aprobado: false, fecha: new Date('2026-11-18T12:00:00.000Z') },
                    { idParticipante: 1, idLeccion: 9, numeroIntento: 2, aprobado: true, fecha: new Date('2026-11-19T12:00:00.000Z') },
                ],
                cursos: [
                    curso({
                        estatus: 'completado',
                        calificacionFinal: 100,
                        fechaConclusion: new Date('2026-11-20T12:00:00.000Z'),
                        fechaFin: new Date('2026-11-20T12:00:00.000Z'),
                        modalidad: 'presencial',
                        clases: [
                            {
                                estatus: 'completada',
                                inicio: new Date('2026-11-01T12:00:00.000Z'),
                                fin: new Date('2026-11-01T13:00:00.000Z'),
                                asistencias: [new Date('2026-11-01T12:00:00.000Z')],
                            },
                        ],
                    }),
                    curso({
                        estatus: 'completado',
                        fechaConclusion: new Date('2026-11-21T12:00:00.000Z'),
                        fechaFin: new Date('2026-11-20T12:00:00.000Z'),
                    }),
                    curso({ estatus: 'completado', fechaFin: null }),
                ],
                commitsScorm: [new Date('2026-11-20T15:00:00.000Z')],
            }),
        );

        expect(estado.conteos).toEqual({ lecciones: 1, quizzes: 2, quizzesPrimera: 1, cursos: 3, cursosATiempo: 2, asistencias: 1 });
        expect(estado.xp).toBe(xpDe(estado.conteos));
        expect(estado.xp).toBe(10 + 40 + 10 + 300 + 100 + 20);
        expect(estado.insignias.find((insignia) => insignia.codigo === 'PRIMER_CURSO')?.ganada).toBe(true);
        expect(estado.insignias.find((insignia) => insignia.codigo === 'PERFECTO')?.ganada).toBe(true);
        expect(estado.insignias.find((insignia) => insignia.codigo === 'PUNTUAL')?.progreso).toEqual({ actual: 2, meta: 5 });
        expect(estado.insignias.find((insignia) => insignia.codigo === 'ASISTENCIA_PERFECTA')?.ganada).toBe(true);
        expect(estado.insignias.find((insignia) => insignia.codigo === 'RUTA_COMPLETA')?.progreso).toEqual({ actual: 0, meta: 1 });
        expect(estado.insignias.map((insignia) => insignia.icono)).toEqual(['award', 'alarm-clock', 'star', 'flame', 'users', 'route']);
    });

    it('la última lección a tiempo y a la primera suma 10 + 20 + 10 + 100 + 50', () => {
        const ganado = diferenciaXp(CERO, { lecciones: 1, quizzes: 1, quizzesPrimera: 1, cursos: 1, cursosATiempo: 1, asistencias: 0 });
        expect(ganado.total).toBe(190);
        expect(ganado.conceptos).toEqual([
            { concepto: 'Lección completada', xp: 10 },
            { concepto: 'Quiz aprobado', xp: 20 },
            { concepto: 'Bono: quiz aprobado a la primera', xp: 10 },
            { concepto: 'Curso aprobado', xp: 100 },
            { concepto: 'Bono: curso terminado a tiempo', xp: 50 },
        ]);
    });

    it('respeta los bordes de nivel', () => {
        expect(nivelDe(299)).toMatchObject({ numero: 1, nombre: 'Explorador', xpDesde: 0, xpSiguiente: 300 });
        expect(nivelDe(300)).toMatchObject({ numero: 2, nombre: 'Aprendiz', xpDesde: 300, xpSiguiente: 800 });
        expect(nivelDe(2499)).toMatchObject({ numero: 4, nombre: 'Experto', xpDesde: 1500, xpSiguiente: 2500 });
        expect(nivelDe(2500)).toMatchObject({ numero: 5, nombre: 'Maestro', xpDesde: 2500, xpSiguiente: null });
        expect(nivelDe(4000).xpSiguiente).toBeNull();
    });

    it('el curso a tiempo exige la conclusión dentro del periodo, o que no tenga fecha fin', () => {
        const fin = new Date('2026-05-01T00:00:00.000Z');
        expect(aTiempo({ estatus: 'completado', fechaConclusion: fin, fechaFin: fin })).toBe(true);
        expect(aTiempo({ estatus: 'completado', fechaConclusion: new Date(fin.getTime() + 1000), fechaFin: fin })).toBe(false);
        expect(aTiempo({ estatus: 'completado', fechaConclusion: null, fechaFin: null })).toBe(true);
        expect(aTiempo({ estatus: 'completado', fechaConclusion: null, fechaFin: fin })).toBe(false);
        expect(aTiempo({ estatus: 'reprobado', fechaConclusion: fin, fechaFin: fin })).toBe(false);
    });

    it('la asistencia perfecta exige todas las clases vigentes ya pasadas', () => {
        const ahora = new Date('2026-11-20T12:00:00.000Z');
        const pasada = {
            estatus: 'completada',
            inicio: new Date('2026-11-01T12:00:00.000Z'),
            fin: new Date('2026-11-01T13:00:00.000Z'),
            asistencias: [new Date('2026-11-01T12:00:00.000Z')],
        };
        const futura = { ...pasada, fin: new Date('2026-12-01T13:00:00.000Z'), estatus: 'programada' };
        const cancelada = { ...pasada, estatus: 'cancelada', asistencias: [] };
        const estado = evaluar(
            fuentes({
                ahora,
                cursos: [
                    curso({ modalidad: 'online_sincrono', clases: [pasada, cancelada] }),
                    curso({ modalidad: 'presencial', clases: [pasada, futura] }),
                    curso({ modalidad: 'presencial', estatusSesion: 'cancelado', clases: [pasada] }),
                    curso({ modalidad: 'online_asincrono', clases: [pasada] }),
                ],
            }),
        );
        expect(estado.insignias.find((insignia) => insignia.codigo === 'ASISTENCIA_PERFECTA')?.progreso.actual).toBe(1);
    });

    it('la racha de cuatro semanas gana Constante y una ganada no se pierde si la racha baja', () => {
        const fechas = ['2026-10-30', '2026-11-06', '2026-11-13', '2026-11-20'].map((dia) => new Date(`${dia}T12:00:00.000Z`));
        const ganada = evaluar(fuentes({ leccionesCompletadas: fechas }));
        const constante = ganada.insignias.find((insignia) => insignia.codigo === 'CONSTANTE');
        expect(constante).toMatchObject({ ganada: true, progreso: { actual: 4, meta: 4 }, icono: 'flame' });

        const conservada = evaluar(
            fuentes({
                logros: [{ codigo: 'CONSTANTE', fechaObtencion: new Date('2026-11-20T12:00:00.000Z'), vistoEn: null }],
            }),
        );
        expect(conservada.insignias.find((insignia) => insignia.codigo === 'CONSTANTE')).toMatchObject({
            ganada: true,
            vista: false,
            progreso: { actual: 0, meta: 4 },
        });
    });

    it('el respaldo de tiempo cae en el mes de la última actividad y suma la duración de la clase', () => {
        const stats = estadisticasDe(
            fuentes({
                zona: 'America/Mexico_City',
                cursos: [
                    curso({
                        estatus: 'completado',
                        calificacionFinal: 80,
                        fechaConclusion: new Date('2026-03-10T18:00:00.000Z'),
                        fechaFin: new Date('2026-03-20T18:00:00.000Z'),
                        tiempoTotalSegundos: 9000,
                        fechaUltimaActividad: new Date('2026-03-10T18:00:00.000Z'),
                        segundosDiarios: [
                            { fecha: '2025-12-01', segundos: 1800 },
                            { fecha: '2026-01-15', segundos: 3600 },
                        ],
                    }),
                    curso({
                        estatus: 'completado',
                        calificacionFinal: 100,
                        fechaConclusion: new Date('2026-05-02T18:00:00.000Z'),
                        fechaFin: new Date('2026-04-01T18:00:00.000Z'),
                        clases: [
                            {
                                estatus: 'completada',
                                inicio: new Date('2026-02-01T15:00:00.000Z'),
                                fin: new Date('2026-02-01T17:00:00.000Z'),
                                asistencias: [new Date('2026-02-01T15:05:00.000Z')],
                            },
                        ],
                    }),
                ],
            }),
            2026,
        );

        expect(stats.horas).toBe(4);
        expect(stats.horasPorMes.map((mes) => mes.horas)).toEqual([1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        expect(stats.cursosAprobados).toBe(2);
        expect(stats.calificacionPromedio).toBe(90);
        expect(stats.porcentajeATiempo).toBe(50);
        expect(stats.aniosDisponibles).toEqual([2025, 2026]);

        const anterior = estadisticasDe(
            fuentes({
                zona: 'America/Mexico_City',
                cursos: [
                    curso({
                        tiempoTotalSegundos: 1800,
                        fechaUltimaActividad: new Date('2025-12-01T18:00:00.000Z'),
                        segundosDiarios: [{ fecha: '2025-12-01', segundos: 1800 }],
                    }),
                ],
            }),
            2025,
        );
        expect(anterior.horas).toBe(0.5);
        expect(anterior.cursosAprobados).toBe(0);
        expect(anterior.calificacionPromedio).toBeNull();
        expect(anterior.porcentajeATiempo).toBeNull();
    });
});
