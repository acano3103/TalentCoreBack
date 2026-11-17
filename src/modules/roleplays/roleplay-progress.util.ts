export type EstatusRoleplay = 'pendiente' | 'en_progreso' | 'aprobado' | 'vencido' | 'sin_intentos';

export interface LlamadaResumen {
    idLlamada: number;
    FechaInicio: Date | null;
    FechaRegistro: Date | null;
    RolePlayEvaluaciones: { ScoreGlobal: unknown } | null;
}

interface AsignacionResumen {
    FechaRegistro: Date | null;
    FechaLimite: Date | null;
    IntentosMaximos: number | null;
}

interface Intento {
    idLlamada: number;
    fecha: Date | null;
    porcentaje: number | null;
}

// Intentos, calificaciones y estatus de una asignación. Solo cuentan las llamadas hechas desde que se asignó.
export function resumirIntentos(llamadas: LlamadaResumen[], asignacion: AsignacionResumen, minima: number | null, ahora = new Date()) {
    const intentos: Intento[] = llamadas
        .filter((l) => !asignacion.FechaRegistro || !l.FechaRegistro || l.FechaRegistro >= asignacion.FechaRegistro)
        .sort((a, b) => a.idLlamada - b.idLlamada)
        .map((l) => ({
            idLlamada: l.idLlamada,
            fecha: l.FechaInicio ?? l.FechaRegistro,
            // ScoreGlobal ya viene en porcentaje (0-100)
            porcentaje: l.RolePlayEvaluaciones ? Math.min(100, Math.round(Number(l.RolePlayEvaluaciones.ScoreGlobal) * 10) / 10) : null,
        }));

    const evaluados = intentos.filter((i) => i.porcentaje !== null);
    const mejor = evaluados.reduce<Intento | null>((m, i) => (!m || i.porcentaje! > m.porcentaje! ? i : m), null);
    const ultimo = evaluados[evaluados.length - 1] ?? null;
    const mejorCalificacion = mejor?.porcentaje ?? null;

    const vencido = !!asignacion.FechaLimite && ahora > asignacion.FechaLimite;
    const agotado = asignacion.IntentosMaximos !== null && intentos.length >= asignacion.IntentosMaximos;
    const aprobado = mejorCalificacion !== null && (minima === null || mejorCalificacion >= minima);

    let estatus: EstatusRoleplay = intentos.length > 0 ? 'en_progreso' : 'pendiente';
    if (aprobado) estatus = 'aprobado';
    else if (vencido) estatus = 'vencido';
    else if (agotado) estatus = 'sin_intentos';

    return {
        intentos: intentos.length,
        mejorCalificacion,
        idLlamadaMejor: mejor?.idLlamada ?? null,
        ultimaCalificacion: ultimo?.porcentaje ?? null,
        idLlamadaUltima: ultimo?.idLlamada ?? null,
        ultimoIntento: intentos[intentos.length - 1]?.fecha ?? null,
        estatus,
        vencido,
        agotado,
    };
}
