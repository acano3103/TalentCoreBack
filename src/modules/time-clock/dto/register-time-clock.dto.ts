import {
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    IsBoolean,
    Max,
    Min,
    MaxLength,
} from 'class-validator';

export enum TimeClockAction {
    ENTRADA = 'ENTRADA',
    INICIO_COMIDA = 'INICIO_COMIDA',
    FIN_COMIDA = 'FIN_COMIDA',
    SALIDA = 'SALIDA',
}

export class RegisterTimeClockDto {
    @IsEnum(TimeClockAction, {
        message: 'El tipo de asistencia no es válido.',
    })
    tipo: TimeClockAction;

    @IsOptional()
    @IsNumber()
    @Min(-90)
    @Max(90)
    latitud?: number;

    @IsOptional()
    @IsNumber()
    @Min(-180)
    @Max(180)
    longitud?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    precisionMetros?: number;

    @IsOptional()
    @IsBoolean()
    ubicacionSimulada?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    navegador?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    versionNavegador?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    sistemaOperativo?: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    tipoDispositivo?: string;
}