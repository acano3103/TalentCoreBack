// personnel-config.interface.ts

export interface VacacionesConfig {
    diasAnticipacionMinima: number;      // Por defecto: 7 días
    mesesBloqueados: number[];            // Números del 1 al 12 (ej. [7, 12])
    permitirSaldoNegativo: boolean;       // Solicitar días antes de devengarlos
    diasMinimosPorSolicitud: number;      // Mínimo de días a pedir (ej. 1)
}

export interface PermisosEIncapacidadesConfig {
    horasLimiteSubirComprobante: number;  // Horas para subir justificante (ej. 48 hrs)
    comprobanteObligatorio: boolean;      // Obligar a subir PDF/foto
    diasAnticipacionPermiso: number;      // Días antes para pedir permiso con/sin goce
}

export interface PermutasConfig {
    permitirPermutas: boolean;
    diasAnticipacionMinima: number;
    diferenciaMaximaDias: number;         // Ventana máxima entre turnos intercambiados
}

export interface MovimientosInternosConfig {
    porcentajeMaximoAumentoSinDireccion: number; // Ej. 15% (más de eso pide firma extra)
    mesesAntiguedadParaPromocion: number;        // Meses en puesto antes de poder moverse
    diasPreavisoBaja: number;                    // Días sugeridos para programar salida
}

export interface PersonnelModuleConfig {
    vacaciones: VacacionesConfig;
    permisosEIncapacidades: PermisosEIncapacidadesConfig;
    permutas: PermutasConfig;
    movimientosInternos: MovimientosInternosConfig;
}

export const DEFAULT_PERSONNEL_CONFIG: PersonnelModuleConfig = {
    vacaciones: {
        diasAnticipacionMinima: 7,
        mesesBloqueados: [],
        permitirSaldoNegativo: false,
        diasMinimosPorSolicitud: 1,
    },
    permisosEIncapacidades: {
        horasLimiteSubirComprobante: 48,
        comprobanteObligatorio: true,
        diasAnticipacionPermiso: 3,
    },
    permutas: {
        permitirPermutas: true,
        diasAnticipacionMinima: 2,
        diferenciaMaximaDias: 14,
    },
    movimientosInternos: {
        porcentajeMaximoAumentoSinDireccion: 15,
        mesesAntiguedadParaPromocion: 6,
        diasPreavisoBaja: 15,
    },
};