export interface CategoriaDetalle {
    porcentaje_cumplimiento: any;
    peso?: any;
    justificacion?: any;
    score_ponderado?: any;
    [key: string]: any;
}

export interface PositionFilters {
    activo?: number;        // 1 = activos, 0 = inactivos, undefined = todos
    idArea?: number;
    idTipoPuesto?: number;
}