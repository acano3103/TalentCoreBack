import {
    CONCEPTO_XP,
    INSIGNIAS,
    NIVELES,
    XP_ASISTENCIA,
    XP_CURSO,
    XP_CURSO_A_TIEMPO,
    XP_LECCION,
    XP_QUIZ,
    XP_QUIZ_PRIMERA,
} from './reglas';
import { calcularRacha, claveSemana } from './semanas';

export interface ConteosXp {
    lecciones: number;
    quizzes: number;
    quizzesPrimera: number;
    cursos: number;
    cursosATiempo: number;
    asistencias: number;
}

export interface Nivel {
    numero: number;
    nombre: string;
    xp: number;
    xpDesde: number;
    xpSiguiente: number | null;
}

export interface Insignia {
    codigo: string;
    nombre: string;
    descripcion: string;
    icono: string;
    ganada: boolean;
    fechaObtencion: string | null;
    vista: boolean;
    progreso: { actual: number; meta: number };
}

export interface EstadoGamificacion {
    xp: number;
    conteos: ConteosXp;
    nivel: Nivel;
    racha: { semanas: number; activaEstaSemana: boolean; ultimas8: { semana: string; activa: boolean }[] };
    insignias: Insignia[];
}

export interface IntentoFuente {
    idParticipante: number;
    idLeccion: number;
    numeroIntento: number;
    aprobado: boolean;
    fecha: Date;
}

export interface ClaseFuenteXp {
    estatus: string | null;
    inicio: Date;
    fin: Date;
    asistencias: Date[];
}

export interface CursoFuenteXp {
    estatus: string | null;
    calificacionFinal: number | null;
    fechaConclusion: Date | null;
    fechaFin: Date | null;
    modalidad: string;
    estatusSesion: string;
    tiempoTotalSegundos: number;
    fechaUltimaActividad: Date | null;
    segundosDiarios: { fecha: string; segundos: number }[];
    clases: ClaseFuenteXp[];
}

export interface LogroFuente {
    codigo: string;
    fechaObtencion: Date;
    vistoEn: Date | null;
}

export interface FuentesGamificacion {
    zona: string;
    ahora: Date;
    leccionesCompletadas: Date[];
    intentos: IntentoFuente[];
    commitsScorm: Date[];
    cursos: CursoFuenteXp[];
    logros: LogroFuente[];
    rutasCompletas: number;
}

export interface EstadisticasAnio {
    anio: number;
    aniosDisponibles: number[];
    horas: number;
    cursosAprobados: number;
    calificacionPromedio: number | null;
    porcentajeATiempo: number | null;
    horasPorMes: { mes: number; horas: number }[];
}

const CONTEOS_CERO: ConteosXp = {
    lecciones: 0,
    quizzes: 0,
    quizzesPrimera: 0,
    cursos: 0,
    cursosATiempo: 0,
    asistencias: 0,
};

export function fuentesVacias(zona: string, ahora: Date): FuentesGamificacion {
    return {
        zona,
        ahora,
        leccionesCompletadas: [],
        intentos: [],
        commitsScorm: [],
        cursos: [],
        logros: [],
        rutasCompletas: 0,
    };
}

export function xpDe(conteos: ConteosXp): number {
    return (
        conteos.lecciones * XP_LECCION +
        conteos.quizzes * XP_QUIZ +
        conteos.quizzesPrimera * XP_QUIZ_PRIMERA +
        conteos.cursos * XP_CURSO +
        conteos.cursosATiempo * XP_CURSO_A_TIEMPO +
        conteos.asistencias * XP_ASISTENCIA
    );
}

export function nivelDe(xp: number): Nivel {
    let actual = NIVELES[0];
    for (const nivel of NIVELES) {
        if (xp >= nivel.xpDesde) actual = nivel;
    }
    const indice = NIVELES.findIndex((nivel) => nivel.numero === actual.numero);
    const siguiente = NIVELES[indice + 1];
    return {
        numero: actual.numero,
        nombre: actual.nombre,
        xp,
        xpDesde: actual.xpDesde,
        xpSiguiente: siguiente ? siguiente.xpDesde : null,
    };
}

export function diferenciaXp(antes: ConteosXp, despues: ConteosXp) {
    const conceptos = [
        { concepto: CONCEPTO_XP.leccion, xp: (despues.lecciones - antes.lecciones) * XP_LECCION },
        { concepto: CONCEPTO_XP.quiz, xp: (despues.quizzes - antes.quizzes) * XP_QUIZ },
        { concepto: CONCEPTO_XP.quizPrimera, xp: (despues.quizzesPrimera - antes.quizzesPrimera) * XP_QUIZ_PRIMERA },
        { concepto: CONCEPTO_XP.curso, xp: (despues.cursos - antes.cursos) * XP_CURSO },
        { concepto: CONCEPTO_XP.cursoATiempo, xp: (despues.cursosATiempo - antes.cursosATiempo) * XP_CURSO_A_TIEMPO },
        { concepto: CONCEPTO_XP.asistencia, xp: (despues.asistencias - antes.asistencias) * XP_ASISTENCIA },
    ].filter((concepto) => concepto.xp > 0);
    return { total: conceptos.reduce((suma, concepto) => suma + concepto.xp, 0), conceptos };
}

export function evaluar(fuentes: FuentesGamificacion): EstadoGamificacion {
    const quizzes = contarQuizzes(fuentes.intentos);
    const cursosAprobados = fuentes.cursos.filter((curso) => curso.estatus === 'completado');
    const conteos: ConteosXp = {
        lecciones: fuentes.leccionesCompletadas.length,
        quizzes: quizzes.aprobados,
        quizzesPrimera: quizzes.primera,
        cursos: cursosAprobados.length,
        cursosATiempo: cursosAprobados.filter((curso) => aTiempo(curso)).length,
        asistencias: fuentes.cursos.reduce((suma, curso) => suma + curso.clases.reduce((acc, clase) => acc + clase.asistencias.length, 0), 0),
    };
    const xp = xpDe(conteos);
    const formato = formatoDia(fuentes.zona);
    const hoy = formato.format(fuentes.ahora);
    const racha = calcularRacha(semanasConActividad(fuentes, formato), hoy);
    const actual = {
        PRIMER_CURSO: conteos.cursos,
        PUNTUAL: conteos.cursosATiempo,
        PERFECTO: fuentes.cursos.filter((curso) => (curso.calificacionFinal ?? -1) >= 100).length,
        CONSTANTE: racha.semanas,
        ASISTENCIA_PERFECTA: fuentes.cursos.filter((curso) => asistenciaPerfecta(curso, fuentes.ahora)).length,
        RUTA_COMPLETA: fuentes.rutasCompletas,
    };
    const logros = new Map(fuentes.logros.map((logro) => [logro.codigo, logro]));
    const insignias = INSIGNIAS.map((def) => {
        const progreso = actual[def.codigo as keyof typeof actual] ?? 0;
        const logro = logros.get(def.codigo);
        return {
            codigo: def.codigo,
            nombre: def.nombre,
            descripcion: def.descripcion,
            icono: def.icono,
            ganada: !!logro || progreso >= def.meta,
            fechaObtencion: logro ? logro.fechaObtencion.toISOString() : null,
            vista: !!logro?.vistoEn,
            progreso: { actual: progreso, meta: def.meta },
        };
    });
    return { xp, conteos, nivel: nivelDe(xp), racha, insignias };
}

export function estadisticasDe(fuentes: FuentesGamificacion, anio: number): EstadisticasAnio {
    const segundos = new Array<number>(12).fill(0);
    const anios = new Set<number>([anio]);
    const formato = formatoDia(fuentes.zona);
    for (const curso of fuentes.cursos) {
        const diario = curso.segundosDiarios.reduce((suma, dia) => suma + dia.segundos, 0);
        for (const dia of curso.segundosDiarios) {
            const [anioDia, mes] = dia.fecha.split('-').map(Number);
            anios.add(anioDia);
            if (anioDia === anio && dia.segundos > 0) segundos[mes - 1] += dia.segundos;
        }
        const residual = Math.max(0, curso.tiempoTotalSegundos - diario);
        if (residual > 0 && curso.fechaUltimaActividad) {
            const [anioActividad, mes] = partesDia(formato.format(curso.fechaUltimaActividad));
            anios.add(anioActividad);
            if (anioActividad === anio) segundos[mes - 1] += residual;
        }
        for (const clase of curso.clases) {
            if (!clase.asistencias.length) continue;
            const [anioClase, mes] = partesDia(formato.format(clase.inicio));
            anios.add(anioClase);
            if (anioClase !== anio) continue;
            segundos[mes - 1] += Math.max(0, Math.round((clase.fin.getTime() - clase.inicio.getTime()) / 1000));
        }
        if (curso.fechaConclusion) anios.add(partesDia(formato.format(curso.fechaConclusion))[0]);
    }
    const aprobados = fuentes.cursos.filter(
        (curso) => curso.estatus === 'completado' && curso.fechaConclusion && anioDe(curso.fechaConclusion, formato) === anio,
    );
    const conCalificacion = aprobados.filter((curso) => curso.calificacionFinal != null);
    const aTiempoEnAnio = aprobados.filter((curso) => aTiempo(curso)).length;
    const totalSegundos = segundos.reduce((suma, mes) => suma + mes, 0);
    return {
        anio,
        aniosDisponibles: [...anios].sort((a, b) => a - b),
        horas: unDecimal(totalSegundos / 3600),
        cursosAprobados: aprobados.length,
        calificacionPromedio: conCalificacion.length
            ? unDecimal(conCalificacion.reduce((suma, curso) => suma + (curso.calificacionFinal ?? 0), 0) / conCalificacion.length)
            : null,
        porcentajeATiempo: aprobados.length ? unDecimal((aTiempoEnAnio / aprobados.length) * 100) : null,
        horasPorMes: segundos.map((valor, indice) => ({ mes: indice + 1, horas: unDecimal(valor / 3600) })),
    };
}

export function aplicarNuevas(insignias: Insignia[], nuevas: Insignia[]): Insignia[] {
    if (!nuevas.length) return insignias;
    const porCodigo = new Map(nuevas.map((insignia) => [insignia.codigo, insignia]));
    return insignias.map((insignia) => porCodigo.get(insignia.codigo) ?? insignia);
}

export function unDecimal(valor: number): number {
    return Math.round(valor * 10) / 10;
}

export function aTiempo(curso: { estatus: string | null; fechaConclusion: Date | null; fechaFin: Date | null }): boolean {
    if (curso.estatus !== 'completado') return false;
    if (!curso.fechaFin) return true;
    if (!curso.fechaConclusion) return false;
    return curso.fechaConclusion.getTime() <= curso.fechaFin.getTime();
}

function contarQuizzes(intentos: IntentoFuente[]) {
    const porLeccion = new Map<string, IntentoFuente[]>();
    for (const intento of intentos) {
        const clave = `${intento.idParticipante}:${intento.idLeccion}`;
        const lista = porLeccion.get(clave) ?? [];
        lista.push(intento);
        porLeccion.set(clave, lista);
    }
    let aprobados = 0;
    let primera = 0;
    for (const lista of porLeccion.values()) {
        if (lista.some((intento) => intento.aprobado)) aprobados += 1;
        if (lista.some((intento) => intento.aprobado && intento.numeroIntento === 1)) primera += 1;
    }
    return { aprobados, primera };
}

function asistenciaPerfecta(curso: CursoFuenteXp, ahora: Date): boolean {
    if (curso.modalidad !== 'presencial' && curso.modalidad !== 'online_sincrono') return false;
    if (curso.estatusSesion === 'cancelado') return false;
    const vigentes = curso.clases.filter((clase) => clase.estatus !== 'cancelada');
    if (!vigentes.length) return false;
    const limite = ahora.getTime();
    return vigentes.every((clase) => clase.fin.getTime() <= limite && clase.asistencias.length > 0);
}

function semanasConActividad(fuentes: FuentesGamificacion, formato: Intl.DateTimeFormat): Set<string> {
    const semanas = new Set<string>();
    const marcar = (fechaLocal: string) => semanas.add(claveSemana(fechaLocal));
    const marcarInstante = (fecha: Date | null | undefined) => {
        if (!fecha) return;
        marcar(formato.format(fecha));
    };
    for (const curso of fuentes.cursos) {
        const diario = curso.segundosDiarios.reduce((suma, dia) => suma + dia.segundos, 0);
        for (const dia of curso.segundosDiarios) {
            if (dia.segundos > 0) marcar(dia.fecha);
        }
        if (Math.max(0, curso.tiempoTotalSegundos - diario) > 0) marcarInstante(curso.fechaUltimaActividad);
        for (const clase of curso.clases) {
            for (const asistencia of clase.asistencias) marcarInstante(asistencia);
        }
    }
    for (const fecha of fuentes.leccionesCompletadas) marcarInstante(fecha);
    for (const intento of fuentes.intentos) marcarInstante(intento.fecha);
    for (const fecha of fuentes.commitsScorm) marcarInstante(fecha);
    return semanas;
}

function anioDe(fecha: Date, formato: Intl.DateTimeFormat): number {
    return partesDia(formato.format(fecha))[0];
}

function formatoDia(zona: string): Intl.DateTimeFormat {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' });
}

function partesDia(fecha: string): [number, number] {
    const [anio, mes] = fecha.split('-').map(Number);
    return [anio, mes];
}

export { CONTEOS_CERO };
