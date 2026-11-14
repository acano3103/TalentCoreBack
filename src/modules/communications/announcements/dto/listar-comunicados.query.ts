import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ESTADOS_COMUNICADO } from '../announcement-state';
import { PRIORIDADES } from '../contenido';

export class ListarComunicadosQuery {
    @ApiPropertyOptional({ enum: ESTADOS_COMUNICADO })
    @IsOptional()
    @IsIn(ESTADOS_COMUNICADO, { message: 'El estado no es válido.' })
    estado?: (typeof ESTADOS_COMUNICADO)[number];

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'El tipo debe ser un identificador entero.' })
    @Min(1, { message: 'El tipo debe ser mayor a cero.' })
    idTipo?: number;

    @ApiPropertyOptional({ enum: PRIORIDADES })
    @IsOptional()
    @IsIn(PRIORIDADES, { message: 'La prioridad no es válida.' })
    prioridad?: (typeof PRIORIDADES)[number];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString({ message: 'La búsqueda debe ser texto.' })
    @MaxLength(120, { message: 'La búsqueda no puede pasar de 120 caracteres.' })
    q?: string;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'La página debe ser un entero.' })
    @Min(1, { message: 'La página debe ser al menos 1.' })
    page?: number;

    @ApiPropertyOptional({ default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'El tamaño de página debe ser un entero.' })
    @Min(1, { message: 'El tamaño de página debe ser al menos 1.' })
    @Max(100, { message: 'El tamaño de página no puede pasar de 100.' })
    pageSize?: number;
}

export class KpisQuery {
    @ApiPropertyOptional({ example: '2026-11' })
    @IsOptional()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'El mes debe tener formato AAAA-MM.' })
    mes?: string;
}
