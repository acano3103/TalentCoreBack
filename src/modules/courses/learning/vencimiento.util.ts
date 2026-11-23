import { localDateString } from 'src/modules/attendance/utils/timezone.util';
import { diasEntreFechas, zonaValida } from 'src/modules/communications/reminders/zona-reloj';

// Misma regla que getVencimiento() del front (CourseLearningTypes). "Hoy" se calcula en la zona de la empresa.
export const DIAS_POR_VENCER = 7;

export type EstadoVencimiento = 'vencido' | 'por_vencer' | 'vigente' | 'sin_fecha' | 'completado';

export interface VencimientoCurso {
    estado: EstadoVencimiento;
    dias: number | null;
}

export function getVencimiento(
    course: {
        estatusAsignacion: string | null;
        estatusSesion: string;
        fechaFinPeriodo: Date | string | null;
    },
    ahora: Date,
    zona: string | null | undefined,
): VencimientoCurso {
    if (course.estatusAsignacion === 'completado') return { estado: 'completado', dias: null };
    if (course.estatusSesion === 'finalizado') return { estado: 'vencido', dias: null };
    if (!course.fechaFinPeriodo) return { estado: 'sin_fecha', dias: null };

    const fin = course.fechaFinPeriodo instanceof Date ? course.fechaFinPeriodo : new Date(course.fechaFinPeriodo);
    if (Number.isNaN(fin.getTime())) return { estado: 'sin_fecha', dias: null };
    if (ahora.getTime() > fin.getTime()) return { estado: 'vencido', dias: null };

    const tz = zonaValida(zona);
    const dias = diasEntreFechas(localDateString(ahora, tz), localDateString(fin, tz));
    if (dias > DIAS_POR_VENCER) return { estado: 'vigente', dias };
    return { estado: 'por_vencer', dias };
}
