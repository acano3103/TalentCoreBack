import { COMMS_EVENTO_CURSO, EmisorHechos, emitirHecho } from 'src/common/events/comms-hechos';

/**
 * Aviso único al pasar a `completado`. El emisor no cambia su respuesta si el aviso falla.
 * Hoy lo disparan el avance nativo o de IA (`submitLessonProgress`) y el commit SCORM.
 * El cierre presencial de RH todavía no escribe `estatusAsignacion`; cuando lo haga, llama aquí
 * después de guardar, con el estatus anterior y el nuevo.
 */
export function avisarCursoAprobado(
    emisor: EmisorHechos | null | undefined,
    entrada: {
        idTenant: number;
        idEmpresa: number;
        idEmpleado: number;
        idSesion: number;
        curso: string;
        calificacion?: number | null;
        anterior: string | null | undefined;
        nuevo: string | null | undefined;
    },
): void {
    if (entrada.nuevo !== 'completado' || entrada.anterior === 'completado') return;
    const calificacion = typeof entrada.calificacion === 'number' && Number.isFinite(entrada.calificacion)
        ? entrada.calificacion
        : null;
    emitirHecho(emisor, COMMS_EVENTO_CURSO, {
        tipo: 'APROBADO',
        idTenant: entrada.idTenant,
        idEmpresa: entrada.idEmpresa,
        idEmpleado: entrada.idEmpleado,
        idSesion: entrada.idSesion,
        curso: entrada.curso.trim() || 'curso',
        calificacion,
    });
}
