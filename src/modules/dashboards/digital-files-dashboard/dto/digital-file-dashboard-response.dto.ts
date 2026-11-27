export interface DigitalFileDashboardKpis {
    totalColaboradoresActivos: number;
    expedientesCompletos: number;
    porcentajeCumplimiento: number;
    expedientesConObservaciones: number;
    sinExpediente: number;
    contratosFirmados: number;
    contratosPendientes: number;
    totalDocumentosEvaluados: number;
    documentosVigentes: number;
    documentosFaltantes: number;
    documentosRechazados: number;
    documentosVencidos: number;
    documentosProximosVencer: number;
    documentosEnRevision: number;
}

export interface DigitalFileDashboardResponseDto {
    periodo: { desde: string | null; hasta: string | null };
    kpis: DigitalFileDashboardKpis;
    estatusExpedientes: { estatus: string; total: number }[];
    estadoDocumentos: {
        estado:
        | 'Vigentes'
        | 'Faltantes'
        | 'Rechazados / Con Observación'
        | 'Vencidos'
        | 'Próximos a vencer'
        | 'En Revisión';
        total: number;
    }[];
    estatusContratos: { estatus: 'Firmado' | 'Pendiente / Sin Contrato'; total: number }[];
    documentosPorTipo: {
        idDocumento: number;
        tipoDocumento: string;
        esRequeridoBase: boolean;
        vigentes: number;
        faltantes: number;
        rechazados: number;
        vencidos: number;
        proximosVencer: number;
        enRevision: number;
        total: number;
    }[];
    porArea: {
        idArea: number | null;
        area: string;
        totalColaboradores: number;
        completos: number;
        conObservaciones: number;
        contratosFirmados: number;
        porcentajeCumplimiento: number;
    }[];
    alertasDocumentos: {
        idDocumentoEmpleado: number;
        idEmpleado: number;
        numeroEmpleado: string | null;
        nombreEmpleado: string;
        area: string;
        puesto: string;
        tipoDocumento: string;
        estadoVigencia: string;
        fechaVencimiento: string | null;
        diasParaVencer: number | null;
    }[];
    colaboradoresPendientes: {
        idEmpleado: number;
        numeroEmpleado: string | null;
        nombreCompleto: string;
        area: string;
        puesto: string;
        estatusExpediente: string;
        estatusContrato: string;
        fechaIngreso: string | null;
    }[];
    opciones: {
        areas: { idArea: number; nombre: string }[];
        ubicaciones: { idSite: number; nombre: string }[];
    };
}