import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationApprovalWorkflowDto {
    @ApiPropertyOptional({ default: 1, description: 'Número de página' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ default: 10, description: 'Límite de registros por página' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 10;

    @ApiPropertyOptional({ description: 'Término de búsqueda por nombre o código del trámite' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ description: 'Filtrar por Módulo (1: Incidencias, 2: Movimientos)' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    idModuloFlujo?: number;
}