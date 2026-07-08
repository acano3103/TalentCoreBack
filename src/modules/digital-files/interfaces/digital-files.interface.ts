export interface DocumentoAceptado {
    campo: string;
    archivo: string;
    score: number | null;
    advertencia?: string | null;
}

export interface DocumentoRechazado {
    campo: string;
    archivo: string;
    motivo: string | null;
    http_status: number;
}