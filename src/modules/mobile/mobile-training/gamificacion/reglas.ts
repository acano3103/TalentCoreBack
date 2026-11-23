export const XP_LECCION = 10;
export const XP_QUIZ = 20;
export const XP_QUIZ_PRIMERA = 10;
export const XP_CURSO = 100;
export const XP_CURSO_A_TIEMPO = 50;
export const XP_ASISTENCIA = 20;

export const CONCEPTO_XP = {
    leccion: 'Lección completada',
    quiz: 'Quiz aprobado',
    quizPrimera: 'Bono: quiz aprobado a la primera',
    curso: 'Curso aprobado',
    cursoATiempo: 'Bono: curso terminado a tiempo',
    asistencia: 'Asistencia a clase',
} as const;

export const REGLAS_XP: { concepto: string; xp: number }[] = [
    { concepto: CONCEPTO_XP.leccion, xp: XP_LECCION },
    { concepto: CONCEPTO_XP.quiz, xp: XP_QUIZ },
    { concepto: CONCEPTO_XP.quizPrimera, xp: XP_QUIZ_PRIMERA },
    { concepto: CONCEPTO_XP.curso, xp: XP_CURSO },
    { concepto: CONCEPTO_XP.cursoATiempo, xp: XP_CURSO_A_TIEMPO },
    { concepto: CONCEPTO_XP.asistencia, xp: XP_ASISTENCIA },
];

export const NIVELES: { numero: number; nombre: string; xpDesde: number }[] = [
    { numero: 1, nombre: 'Explorador', xpDesde: 0 },
    { numero: 2, nombre: 'Aprendiz', xpDesde: 300 },
    { numero: 3, nombre: 'Practicante', xpDesde: 800 },
    { numero: 4, nombre: 'Experto', xpDesde: 1500 },
    { numero: 5, nombre: 'Maestro', xpDesde: 2500 },
];

export const INSIGNIAS: {
    codigo: string;
    nombre: string;
    descripcion: string;
    icono: string;
    meta: number;
}[] = [
    { codigo: 'PRIMER_CURSO', nombre: 'Primer curso', descripcion: 'Aprueba un curso.', icono: 'award', meta: 1 },
    { codigo: 'PUNTUAL', nombre: 'Puntual', descripcion: 'Aprueba 5 cursos a tiempo.', icono: 'alarm-clock', meta: 5 },
    { codigo: 'PERFECTO', nombre: 'Perfecto', descripcion: 'Obtén 100 de calificación final en un curso.', icono: 'star', meta: 1 },
    { codigo: 'CONSTANTE', nombre: 'Constante', descripcion: 'Mantén una racha de 4 semanas.', icono: 'flame', meta: 4 },
    {
        codigo: 'ASISTENCIA_PERFECTA',
        nombre: 'Asistencia perfecta',
        descripcion: 'Asiste al 100 % de un curso presencial o síncrono con todas sus clases ya pasadas.',
        icono: 'users',
        meta: 1,
    },
    {
        codigo: 'RUTA_COMPLETA',
        nombre: 'Ruta completa',
        descripcion: 'Completa un plan de carrera al 100 %.',
        icono: 'route',
        meta: 1,
    },
];
