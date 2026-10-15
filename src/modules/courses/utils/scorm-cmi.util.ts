import { ScormVersion } from './scorm-manifest.util';

export type CmiValues = Record<string, string>;

// Llaves que pone la plataforma (solo lectura para el paquete) o que no vale la pena guardar
const LLAVES_NO_GUARDADAS = [
    /^cmi\.core\.(student_id|student_name|entry|credit|lesson_mode|total_time)$/,
    /^cmi\.(learner_id|learner_name|entry|credit|mode|total_time|launch_data|completion_threshold|scaled_passing_score|max_time_allowed|time_limit_action)$/,
    /^cmi\.student_data\./,
    /\._(children|count|version)$/,
    /^cmi\.interactions\./,
];

export const MAX_LONGITUD_VALOR = 65000;

export function sanitizeCmi(valores: Record<string, unknown>): CmiValues {
    const limpio: CmiValues = {};
    for (const [key, value] of Object.entries(valores ?? {})) {
        if (!key.startsWith('cmi.') || key.length > 255) continue;
        if (LLAVES_NO_GUARDADAS.some((re) => re.test(key))) continue;
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
        limpio[key] = String(value).slice(0, MAX_LONGITUD_VALOR);
    }
    return limpio;
}

export interface ResultadoScorm {
    estatusLeccion: string | null;
    estatusExito: string | null;
    completado: boolean;
    aprobado: boolean | null; // null = el paquete no reporta aprobado / reprobado
    calificacion: number | null; // 0 a 100
    ubicacion: string | null;
    datosSuspension: string | null;
    tiempoSesion: string | null;
}

const num = (v: string | undefined) => (v == null || v.trim() === '' || isNaN(Number(v)) ? null : Number(v));
const round2 = (v: number) => Math.round(v * 100) / 100;

function toPercent(raw: number | null, min: number | null, max: number | null, scaled: number | null): number | null {
    let valor: number | null = null;
    if (scaled != null) valor = scaled * 100;
    else if (raw != null && max != null && max > (min ?? 0)) valor = ((raw - (min ?? 0)) / (max - (min ?? 0))) * 100;
    else if (raw != null) valor = raw;
    return valor == null ? null : round2(Math.min(100, Math.max(0, valor)));
}

// Traduce lo que reporta el paquete (1.2 o 2004) a un resultado común
export function readResult(version: ScormVersion, cmi: CmiValues): ResultadoScorm {
    if (version === 'scorm_12') {
        const estatus = (cmi['cmi.core.lesson_status'] ?? '').toLowerCase() || null;
        return {
            estatusLeccion: estatus,
            estatusExito: null,
            completado: ['passed', 'completed', 'failed'].includes(estatus ?? ''),
            aprobado: estatus === 'passed' ? true : estatus === 'failed' ? false : null,
            calificacion: toPercent(num(cmi['cmi.core.score.raw']), num(cmi['cmi.core.score.min']), num(cmi['cmi.core.score.max']), null),
            ubicacion: cmi['cmi.core.lesson_location'] || null,
            datosSuspension: cmi['cmi.suspend_data'] || null,
            tiempoSesion: cmi['cmi.core.session_time'] || null,
        };
    }

    const completion = (cmi['cmi.completion_status'] ?? '').toLowerCase() || null;
    const success = (cmi['cmi.success_status'] ?? '').toLowerCase() || null;
    return {
        estatusLeccion: completion,
        estatusExito: success,
        completado: completion === 'completed' || success === 'passed' || success === 'failed',
        aprobado: success === 'passed' ? true : success === 'failed' ? false : null,
        calificacion: toPercent(num(cmi['cmi.score.raw']), num(cmi['cmi.score.min']), num(cmi['cmi.score.max']), num(cmi['cmi.score.scaled'])),
        ubicacion: cmi['cmi.location'] || null,
        datosSuspension: cmi['cmi.suspend_data'] || null,
        tiempoSesion: cmi['cmi.session_time'] || null,
    };
}

// Tiempo SCORM a segundos: 1.2 usa "HHHH:MM:SS.SS" y 2004 usa ISO 8601 ("PT1H2M3.5S")
export function scormTimeToSeconds(value: string | null | undefined): number {
    if (!value) return 0;
    const v = value.trim();
    const clock = /^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(v);
    if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
    const iso = /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(v);
    if (!iso) return 0;
    const [, y, mo, d, h, mi, s] = iso.map((x) => (x ? Number(x) : 0));
    return y * 31536000 + mo * 2592000 + d * 86400 + h * 3600 + mi * 60 + s;
}

export function secondsToScormTime(version: ScormVersion, totalSeconds: number): string {
    const total = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (version === 'scorm_2004') return `PT${h}H${m}M${s}S`;
    return `${String(h).padStart(4, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
