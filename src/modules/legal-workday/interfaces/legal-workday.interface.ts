export interface LegalConfigItem {
    idConfiguracion: number;
    idTenant: number;
    idEmpresa: number;
    codigoPais: string;
    anio: number;
    horasSemana: number;
    horasDia: number;
    extraSemanalMax: number;
    extraDiarioMax: number;
    diasConExtraMax: number;
    factorDentro: number;
    factorFuera: number;
    primaDominical: number;
    activo: boolean;
    fechaRegistro?: Date | null;
    fechaActualizacion?: Date | null;
}

export interface LegalWorkdayStatusResponse {
    isEnabled: boolean;
    config: LegalConfigItem[];
}

// Configuración base estándar (LFT México)
export const DEFAULT_LEGAL_WORKDAY_CONFIG: Omit<
    LegalConfigItem,
    'idConfiguracion' | 'idTenant' | 'idEmpresa' | 'anio' | 'fechaRegistro' | 'fechaActualizacion'
> = {
    codigoPais: 'MEX',
    horasSemana: 48,
    horasDia: 8,
    extraSemanalMax: 9,
    extraDiarioMax: 3,
    diasConExtraMax: 3,
    factorDentro: 2,
    factorFuera: 3,
    primaDominical: 0.25,
    activo: false,
};