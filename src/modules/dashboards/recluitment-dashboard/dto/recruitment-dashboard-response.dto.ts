export interface RecruitmentDashboardKpis {
    vacantesAbiertas: number;
    posicionesAbiertas: number;
    requisicionesActivas: number;
    pendientesAprobacion: number;
    vacantesCerradas: number;
    vacantesRechazadas: number;
    totalPostulaciones: number;
    candidatosEnProceso: number;
    entrevistasProgramadas: number;
    contratados: number;
    tasaConversionContratacion: number; // % contratados / totalPostulaciones
    diasPromedioCobertura: number;
    totalDocsGenerados: number;
    docsFirmados: number;
    docsSellados: number;
}

export interface RecruitmentDashboardResponseDto {
    periodo: { desde: string; hasta: string };
    kpis: RecruitmentDashboardKpis;
    vacantesPorTipoRegistro: {
        tipo:
        | 'Vacante Abierta'
        | 'Requisición en Revisión'
        | 'Cerrada'
        | 'Rechazada por Manager'
        | 'Rechazada por RH'
        | 'Cancelada'
        | 'Otro';
        vacantes: number;
        posiciones: number;
    }[];
    embudoPostulaciones: {
        etapa: string;
        total: number;
    }[];
    fuentesCandidatos: {
        fuente: string;
        postulaciones: number;
        contratados: number;
    }[];
    porArea: {
        idArea: number | null;
        area: string;
        vacantesAbiertas: number;
        posicionesAbiertas: number;
        requisicionesActivas: number;
        cerradas: number;
        postulaciones: number;
        contratados: number;
    }[];
    porUbicacion: {
        idSite: number | null;
        ubicacion: string;
        vacantesAbiertas: number;
        posicionesAbiertas: number;
        postulaciones: number;
        contratados: number;
    }[];
    tendenciaMensual: {
        mes: string;
        vacantesCreadas: number;
        postulaciones: number;
        contratados: number;
    }[];
    vacantesRecientes: {
        idVacante: number;
        puesto: string;
        area: string;
        ubicacion: string;
        numeroVacantes: number;
        estatusVacante: string;
        tipoRegistro: string;
        postulaciones: number;
        enProceso: number;
        contratados: number;
        diasAntiguedad: number;
        fechaCreacion: string | null;
        docsFirmados: number;
        totalDocs: number;
    }[];
    opciones: {
        areas: { idArea: number; nombre: string }[];
        ubicaciones: { idSite: number; nombre: string }[];
        puestos: { idPuesto: number; nombre: string }[];
    };
}