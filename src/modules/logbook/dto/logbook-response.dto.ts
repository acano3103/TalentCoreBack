export interface LogbookItemDto {
    idRegistro: string;
    empleado: {
        idEmpleado: number;
        numeroEmpleado: string | null;
        nombreCompleto: string;
    };
    fechaHoraRegistro: Date;
    tipo: 'ENTRADA' | 'SALIDA' | 'INICIO_COMIDA' | 'FIN_COMIDA';
    canal: 'APP_MOVIL' | 'IVR' | 'BIOMETRICO' | 'NFC' | 'WEB_MANUAL';
    ubicacionDispositivo: string | null;
    geocerca: {
        resultado: 'DENTRO' | 'FUERA_PERMITIDA' | 'FUERA_BLOQUEADA' | 'NO_APLICA';
        latitud: number | null;
        longitud: number | null;
    };
    evidencia: {
        tieneFoto: boolean;
        urlFoto: string | null;
    };
    sync: {
        esOffline: boolean;
        fechaHoraRecepcion: Date;
        label: string; // ej. "En línea", "Offline", "Artemis"
    };
    estatusProcesamiento: 'PENDIENTE' | 'PROCESADO' | 'DUPLICADO' | 'RECHAZADO';
}

export interface PaginatedLogbookResponseDto {
    data: LogbookItemDto[];
    meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
}