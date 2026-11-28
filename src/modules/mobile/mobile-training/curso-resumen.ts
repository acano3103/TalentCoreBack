import { EstadoVencimiento } from 'src/modules/courses/learning/vencimiento.util';

export type ModalidadCurso = 'online_asincrono' | 'presencial' | 'online_sincrono';
export type TipoContenidoCurso = 'scorm' | 'nativo' | 'ia';
export type ModoAvanceCurso = 'libre' | 'video_completo' | 'aprobar_quiz' | 'video_y_quiz';
export type EstatusSesionCurso = 'programado' | 'en_curso' | 'finalizado' | 'cancelado';
export type EstatusAsignacionCurso = 'inscrito' | 'completado' | 'reprobado' | 'no_asistio';

export interface AsistenciaResumen {
    asistidas: number;
    total: number;
    porcentajeMinimo: number;
}

export interface CursoResumen {
    idSesion: number;
    idParticipante: number;
    nombreCurso: string;
    modalidad: ModalidadCurso;
    tipoContenido: TipoContenidoCurso | null;
    modoAvance: ModoAvanceCurso | null;
    fechaInicioPeriodo: string;
    fechaFinPeriodo: string | null;
    estatusSesion: EstatusSesionCurso;
    disponible: boolean;
    motivoNoDisponible: string | null;
    estatusAsignacion: EstatusAsignacionCurso | null;
    calificacionFinal: number | null;
    calificacionAprobatoria: number;
    leccionesCompletadas: number;
    totalLecciones: number;
    porcentajeAvance: number;
    vencimiento: { estado: EstadoVencimiento; dias: number | null };
    ultimaActividad: string | null;
    asistencia: AsistenciaResumen | null;
}
