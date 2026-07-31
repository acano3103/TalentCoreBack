// Interfaces de Retorno Estructuradas
export interface NubariumStandardResult {
    validado: boolean;
    score: number | null;
    motivo_rechazo: string | null;
    http_status: number;
    respuesta_json: any;
    endpoint: string;
    error_infraestructura: boolean;
}

export interface CurpRenapoResult {
    success: boolean;
    nombre: string;
    primerApellido: string;
    segundoApellido: string;
    http_status: number;
    respuesta_json: any;
    error: string | null;
}

export interface Nom151Result {
    codigoValidacion: string;
    nom151Base64: string;
    hash: string;
    representacionVisualBase64: string | null;
}