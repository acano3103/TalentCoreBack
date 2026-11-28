/**
 * Hechos de otros módulos. El emisor no decide si hay recordatorio:
 * solo avisa, y un fallo aquí no cambia su respuesta HTTP.
 */

export const COMMS_EVENTO_DOCUMENTO = 'comms.documento';
export const COMMS_EVENTO_CURSO = 'comms.curso';
export const COMMS_EVENTO_APROBACION = 'comms.aprobacion';
export const COMMS_EVENTO_ESTATUS = 'comms.estatus';
export const COMMS_EVENTO_EMPLEADO = 'comms.empleado';

export type TipoHechoEmpleado = 'ALTA' | 'MOVIMIENTO' | 'BAJA';

/** Alta, cambio de puesto/ubicación/jefe/empresa, o baja. El emisor no decide la audiencia. */
export interface HechoEmpleado {
    tipo: TipoHechoEmpleado;
    idTenant: number;
    idEmpresa: number;
    idEmpleado: number;
}

export type TipoDocumento = 'FALTANTE' | 'POR_VENCER' | 'RECHAZADO';
export type TipoCurso = 'ASIGNADO' | 'POR_VENCER' | 'ATRASADO' | 'APROBADO';
export type OrigenSolicitud = 'INCIDENCIA' | 'VACACION' | 'PERMISO' | 'MOVIMIENTO_INTERNO';

export interface HechoDocumento {
    tipo: TipoDocumento;
    idTenant: number;
    idEmpresa: number;
    idEmpleado: number;
    idDocumentoEmpleado: number;
    documento: string;
    fechaLimite?: string | null;
}

export interface HechoCurso {
    tipo: TipoCurso;
    idTenant: number;
    idEmpresa: number;
    idEmpleado: number;
    idSesion: number;
    curso: string;
    fechaLimite?: string | null;
    /** Presente en APROBADO cuando el cierre dejó calificación. */
    calificacion?: number | null;
}

export interface HechoAprobacion {
    idTenant: number;
    idEmpresa: number;
    idEmpleado: number;
    idSolicitud: number;
    origen: 'INCIDENCIA' | 'MOVIMIENTO_INTERNO';
    paso: number;
    solicitud: string;
}

export interface HechoEstatus {
    origen: OrigenSolicitud;
    idTenant: number;
    idEmpresa: number;
    idEmpleado: number;
    idSolicitud: number;
    estatus: string;
    solicitud: string;
}

export interface EmisorHechos {
    emit(evento: string, payload: unknown): boolean;
}

export function emitirHecho(emisor: EmisorHechos | null | undefined, evento: string, payload: unknown): void {
    if (!emisor) return;
    try {
        emisor.emit(evento, payload);
    } catch {
        // El módulo de origen conserva su respuesta.
    }
}
