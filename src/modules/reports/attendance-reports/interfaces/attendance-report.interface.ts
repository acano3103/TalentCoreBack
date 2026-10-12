export interface ToleranciaConfig {
    minutosToleranciaEntrada: number;
    minutosLimiteRetardo: number;
    acumulacionRetardosParaFalta?: number;
}

export interface EvaluacionEntrada {
    esRetardo: boolean;
    esFaltaPorRetardo: boolean;
    minutosRetardo: number;
    estado: 'A_TIEMPO' | 'RETARDO' | 'FALTA_RETARDO' | 'SIN_CHECK';
}

export interface FilaReporteHorasSemanales {
    semanaISO: string;
    fechaInicio: string;
    fechaFin: string;
    numeroEmpleado: string;
    nombreEmpleado: string;
    area: string;
    puesto: string;
    jefeInmediato: string;
    ubicacion: string;
    diasLaborables: number;
    diasDescanso: number;
    faltas: number;
    minutosTrabajados: number;
    horasTrabajadas: string;
    minutosOrdinarios: number;
    horasOrdinarias: string;
    minutosExtra: number;
    horasExtra: string;
    minutosExtraDobles: number;
    minutosExtraTriples: number;
    factorPagoDentro: number;
    factorPagoSobre: number;
    minutosRetardo: number;
    limiteLegalSemana: number;
    topeExtraSemana: number;
    pctSobreLimite: number;
    excedeLimiteLegal: 'SI' | 'NO';
    excedeTopeExtra: 'SI' | 'NO';
    anioConfiguracionLegal: number;
}

export interface FilaReporteFaltas {
    fecha: string;
    diaSemana: string;
    numeroEmpleado: string;
    nombreEmpleado: string;
    area: string;
    puesto: string;
    jefeInmediato: string;
    ubicacion: string;
    estatusJornada: string;
    tipoFalta: string;
    horaEntradaReal: string;
    minutosTrabajados: number;
    justificada: string;
    idTipoIncidencia: string;
    tipoIncidencia: string;
    folioIncidencia: string;
    revisada: number;
    idJornada: number;
}