import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsIn,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

const ISO_CON_OFFSET =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export const TIPOS_CHECADA_MOVIL = [
    'ENTRADA',
    'SALIDA',
    'INICIO_COMIDA',
    'FIN_COMIDA',
] as const;

export type TipoChecadaMovil = (typeof TIPOS_CHECADA_MOVIL)[number];

export class MobileCheckDto {
    @ApiProperty({ format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' })
    @IsUUID('4', { message: 'uuidCliente debe ser un UUID v4.' })
    uuidCliente: string;

    @ApiProperty({ enum: TIPOS_CHECADA_MOVIL })
    @IsIn(TIPOS_CHECADA_MOVIL, {
        message: 'tipo debe ser ENTRADA, SALIDA, INICIO_COMIDA o FIN_COMIDA.',
    })
    tipo: TipoChecadaMovil;

    @ApiProperty({
        example: '2026-09-27T08:05:00-06:00',
        description: 'ISO-8601 con offset. Obligatorio para detectar el desfase del reloj.',
    })
    @Matches(ISO_CON_OFFSET, {
        message: 'fechaHoraRegistro debe ser ISO-8601 con offset (por ejemplo 2026-09-27T08:05:00-06:00).',
    })
    fechaHoraRegistro: string;

    @ApiPropertyOptional({ example: 'America/Mexico_City', description: 'Zona IANA informativa' })
    @IsOptional()
    @IsString()
    @MaxLength(64)
    zonaHoraria?: string;

    @ApiProperty({ example: 'a1b2c3d4e5f6g7h8' })
    @IsString()
    @IsNotEmpty({ message: 'identificadorDispositivo es obligatorio.' })
    @MaxLength(120)
    identificadorDispositivo: string;

    @ApiPropertyOptional({ example: '1.4.0' })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    versionApp?: string;

    @ApiPropertyOptional({ example: 19.432608 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(-90)
    @Max(90)
    latitud?: number;

    @ApiPropertyOptional({ example: -99.133209 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(-180)
    @Max(180)
    longitud?: number;

    @ApiPropertyOptional({ example: 12 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    precisionMetros?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    ubicacionSimulada?: boolean;

    @ApiPropertyOptional({ example: 81 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    idEvidencia?: number;

    @ApiPropertyOptional({ maxLength: 255 })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    motivoFueraGeocerca?: string;

    @ApiPropertyOptional({ default: false })
    @IsOptional()
    @IsBoolean()
    esOffline?: boolean;

    @ApiPropertyOptional({ example: '2026-09-27T08:06:12-06:00' })
    @IsOptional()
    @Matches(ISO_CON_OFFSET, {
        message: 'fechaHoraSincronizacion debe ser ISO-8601 con offset.',
    })
    fechaHoraSincronizacion?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    desfaseRelojSegundos?: number;
}
