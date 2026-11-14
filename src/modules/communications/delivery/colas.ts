export const COLA_ENVIO = 'comms-dispatch';
export const COLA_ESCALAMIENTO = 'comms-escalation';

export const LOTE_CONGELAR = 1000;
export const LOTE_ENVIO = 500;

export interface JobProgramado {
    idComunicado: number;
}

export interface JobLote {
    idComunicado: number;
    ids: number[];
}

export interface JobDiferido {
    idComunicado: number;
    idDestinatario: number;
    canales: string[];
}

export interface JobActualizacion {
    idComunicado: number;
}

export interface JobEscalar {
    idDestinatario: number;
}
