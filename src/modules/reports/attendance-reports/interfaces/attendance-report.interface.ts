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