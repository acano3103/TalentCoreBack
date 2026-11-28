import { ventanaAsistencia, ventanaJson } from 'src/modules/courses/attendance/ventana-asistencia';

export type ModalidadClase = 'presencial' | 'online_sincrono';
export type EstatusClase = 'programada' | 'completada' | 'cancelada';

export interface ClaseResumen {
    idFechaClase: number;
    idSesion: number;
    nombreCurso: string;
    modalidad: ModalidadClase;
    tituloClase: string | null;
    numero: number;
    totalClases: number;
    fechaHoraInicio: string;
    fechaHoraFin: string;
    ubicacionFisica: string | null;
    linkReunion: string | null;
    instructor: string | null;
    estatus: EstatusClase;
    ventana: { estado: 'no_iniciada' | 'abierta' | 'cerrada'; desde: string; hasta: string };
    puedeRegistrar: boolean;
    puedeUnirse: boolean;
    asistencia: { registrada: boolean; fechaHoraRegistro: string | null; metodo: string | null };
}

const MINUTOS_PARA_UNIRSE = 10;

export interface ClaseFuente {
    idFechaClase: number;
    tituloClase?: string | null;
    estatus?: string | null;
    fechaHoraInicio: Date | string;
    fechaHoraFin: Date | string;
    CursoAsistencias?: Array<{ fechaHoraRegistro?: Date | string | null; metodoRegistro?: string | null }>;
}

export interface SesionParaClases {
    idSesion: number;
    modalidad?: string | null;
    estatus?: string | null;
    ubicacionFisica?: string | null;
    linkReunion?: string | null;
    minutosToleranciaQr?: number | null;
    tipoInstructor?: string | null;
    nombreInstructorExterno?: string | null;
    empresaInstructorExterno?: string | null;
    CatCursos?: { Descripcion?: string | null } | null;
    Empleados?: { nombre?: string | null; primerApellido?: string | null; segundoApellido?: string | null } | null;
    CursoFechasClase?: ClaseFuente[];
}

export function resumirClases(sesion: SesionParaClases, ahora = new Date()): ClaseResumen[] {
    if (sesion.modalidad !== 'presencial' && sesion.modalidad !== 'online_sincrono') return [];

    const ordenadas = [...(sesion.CursoFechasClase ?? [])].sort(compararClase);
    const vigentes = ordenadas.filter((clase) => clase.estatus !== 'cancelada');
    const numeroDe = new Map(vigentes.map((clase, indice) => [clase.idFechaClase, indice + 1]));
    const modalidad = sesion.modalidad;
    const sesionCancelada = sesion.estatus === 'cancelado';
    const link = modalidad === 'online_sincrono' ? texto(sesion.linkReunion) : null;

    return ordenadas.map((clase) => {
        const inicio = new Date(clase.fechaHoraInicio);
        const fin = new Date(clase.fechaHoraFin);
        const ventana = ventanaAsistencia({
            fechaHoraInicio: inicio,
            fechaHoraFin: fin,
            minutosToleranciaQr: sesion.minutosToleranciaQr,
            ahora,
        });
        const registro = clase.CursoAsistencias?.[0];
        const registrada = !!registro;
        const estatus = estatusClase(clase.estatus);
        const cancelada = estatus === 'cancelada';
        const ahoraMs = ahora.getTime();

        return {
            idFechaClase: clase.idFechaClase,
            idSesion: sesion.idSesion,
            nombreCurso: texto(sesion.CatCursos?.Descripcion) || 'Sin Nombre',
            modalidad,
            tituloClase: texto(clase.tituloClase),
            numero: numeroDe.get(clase.idFechaClase) ?? 0,
            totalClases: vigentes.length,
            fechaHoraInicio: inicio.toISOString(),
            fechaHoraFin: fin.toISOString(),
            ubicacionFisica: texto(sesion.ubicacionFisica),
            linkReunion: link,
            instructor: instructorDe(sesion),
            estatus,
            ventana: ventanaJson(ventana),
            puedeRegistrar: ventana.estado === 'abierta' && !registrada && !sesionCancelada && !cancelada,
            puedeUnirse:
                modalidad === 'online_sincrono' &&
                !!link &&
                !cancelada &&
                !sesionCancelada &&
                ahoraMs >= inicio.getTime() - MINUTOS_PARA_UNIRSE * 60_000 &&
                ahoraMs <= fin.getTime(),
            asistencia: {
                registrada,
                fechaHoraRegistro: registro?.fechaHoraRegistro ? new Date(registro.fechaHoraRegistro).toISOString() : null,
                metodo: registro?.metodoRegistro ?? null,
            },
        };
    });
}

function compararClase(a: ClaseFuente, b: ClaseFuente): number {
    const diferencia = new Date(a.fechaHoraInicio).getTime() - new Date(b.fechaHoraInicio).getTime();
    if (diferencia !== 0) return diferencia;
    return a.idFechaClase - b.idFechaClase;
}

function estatusClase(valor: string | null | undefined): EstatusClase {
    if (valor === 'completada' || valor === 'cancelada') return valor;
    return 'programada';
}

function instructorDe(sesion: SesionParaClases): string | null {
    if (sesion.tipoInstructor === 'externo') {
        const nombre = texto(sesion.nombreInstructorExterno);
        const empresa = texto(sesion.empresaInstructorExterno);
        if (nombre && empresa) return `${nombre} (${empresa})`;
        return nombre || empresa;
    }
    const empleado = sesion.Empleados;
    if (!empleado) return null;
    return texto(`${empleado.nombre ?? ''} ${empleado.primerApellido ?? ''} ${empleado.segundoApellido ?? ''}`);
}

function texto(valor: string | null | undefined): string | null {
    const limpio = valor?.trim();
    return limpio ? limpio : null;
}
