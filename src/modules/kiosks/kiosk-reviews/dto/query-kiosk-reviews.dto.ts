import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { RegistrosKioscoPorIdentificar_tipoIncidencia } from 'generated/prisma/enums';

export enum FuenteRevisionKiosco {
    registros = 'registros',
    incidencias = 'incidencias',
}

const BANDERAS_REVISION = ['SIN_ROSTRO', 'DESFASE_RELOJ', 'OFFLINE', 'DOBLE_CANAL', 'MUESTREO'] as const;

export class QueryKioskReviewsDto {
    @ApiProperty({ enum: FuenteRevisionKiosco, description: 'Origen de la bandeja.' })
    @IsEnum(FuenteRevisionKiosco, { message: 'La fuente debe ser registros o incidencias.' })
    fuente: FuenteRevisionKiosco;

    @ApiPropertyOptional({ description: 'Inicio del rango (YYYY-MM-DD o ISO).', example: '2026-11-11' })
    @IsOptional()
    @IsString()
    from?: string;

    @ApiPropertyOptional({ description: 'Fin del rango (YYYY-MM-DD o ISO).', example: '2026-11-11' })
    @IsOptional()
    @IsString()
    to?: string;

    @ApiPropertyOptional({ description: 'Filtra por kiosco.' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idKiosco?: number;

    @ApiPropertyOptional({ description: 'Filtra por ubicación del site.' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idSite?: number;

    @ApiPropertyOptional({
        description: 'Solo para fuente=registros. Bandera de revisión.',
        enum: BANDERAS_REVISION,
    })
    @IsOptional()
    @IsIn(BANDERAS_REVISION, { message: 'La bandera no es válida.' })
    bandera?: (typeof BANDERAS_REVISION)[number];

    @ApiPropertyOptional({
        description: 'Solo para fuente=incidencias.',
        enum: RegistrosKioscoPorIdentificar_tipoIncidencia,
    })
    @IsOptional()
    @IsEnum(RegistrosKioscoPorIdentificar_tipoIncidencia, { message: 'El tipo de incidencia no es válido.' })
    tipoIncidencia?: RegistrosKioscoPorIdentificar_tipoIncidencia;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page: number = 1;

    @ApiPropertyOptional({ default: 10, description: 'Máximo 100.' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit: number = 10;
}

export class QueryKioskReviewCountsDto {
    @ApiPropertyOptional({ example: '2026-11-11' })
    @IsOptional()
    @IsString()
    from?: string;

    @ApiPropertyOptional({ example: '2026-11-11' })
    @IsOptional()
    @IsString()
    to?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idKiosco?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idSite?: number;
}
