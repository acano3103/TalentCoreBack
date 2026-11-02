export type ModalidadCurso = 'presencial' | 'online_sincrono' | 'online_asincrono';

// Indicadores de un periodo (se calculan igual para el periodo actual y el anterior)
export interface TrainingDashboardKpis {
    inscritos: number;              // participaciones (una persona puede estar en varios cursos)
    personasInscritas: number;      // empleados distintos
    personasCapacitadas: number;    // empleados distintos con al menos un curso aprobado
    cumplimiento: number;           // % aprobados / inscritos
    aprobacion: number;             // % aprobados / terminados (aprobados + reprobados)
    calificacionPromedio: number | null;
    horasCapacitacion: number;      // en línea: tiempo real de estudio; presencial: horas de clases asistidas
    enRiesgo: number;
    vencidos: number;               // periodo terminado sin aprobar
}

export interface TrainingDashboardResponseDto {
    periodo: { desde: string; hasta: string; anteriorDesde: string; anteriorHasta: string };
    kpis: TrainingDashboardKpis;
    kpisAnterior: TrainingDashboardKpis;
    embudo: { inscritos: number; iniciaron: number; terminaron: number; aprobaron: number };
    tendenciaMensual: { mes: string; inscritos: number; completados: number; horas: number }[];
    porModalidad: { modalidad: ModalidadCurso; inscritos: number; completados: number; cumplimiento: number }[];
    porArea: { idArea: number | null; area: string; inscritos: number; completados: number; cumplimiento: number }[];
    cursos: {
        idCurso: number;
        curso: string;
        inscritos: number;
        completados: number;
        reprobados: number;
        cumplimiento: number;
        aprobacion: number;
        calificacionPromedio: number | null;
        horas: number;
    }[];
    alertas: {
        sesionesPorVencer: { idSesion: number; idCurso: number; curso: string; fechaFin: string; inscritos: number; cumplimiento: number }[];
        inactivos: number;
        vencidos: number;
        cursosAltaReprobacion: { idCurso: number; curso: string; terminados: number; reprobacion: number }[];
    };
    opciones: {
        cursos: { idCurso: number; nombre: string }[];
        areas: { idArea: number; nombre: string }[];
    };
}
