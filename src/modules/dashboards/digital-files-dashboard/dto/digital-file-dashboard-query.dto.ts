import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class DigitalFileDashboardQueryDto {
    @ApiPropertyOptional({ description: 'YYYY-MM-DD (filtro opcional por fecha de ingreso / carga)' })
    @IsOptional()
    @IsString()
    desde?: string;

    @ApiPropertyOptional({ description: 'YYYY-MM-DD (filtro opcional por fecha de ingreso / carga)' })
    @IsOptional()
    @IsString()
    hasta?: string;

    @ApiPropertyOptional({ description: 'Filtrar por área (del puesto del empleado)' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idArea?: number;

    @ApiPropertyOptional({ description: 'Filtrar por ubicación (idSite del empleado)' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idSite?: number;

    @ApiPropertyOptional({ description: 'Filtrar por tipo de contratación (idTipoContratacion)' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idTipoContratacion?: number;

    @ApiPropertyOptional({
        description: 'Filtrar por estatus de expediente',
        enum: ['TODOS', 'COMPLETO', 'INCOMPLETO', 'RECHAZO', 'SIN_EXPEDIENTE'],
    })
    @IsOptional()
    @IsString()
    @IsIn(['TODOS', 'COMPLETO', 'INCOMPLETO', 'RECHAZO', 'SIN_EXPEDIENTE'])
    @MaxLength(30)
    estatusExpediente?: 'TODOS' | 'COMPLETO' | 'INCOMPLETO' | 'RECHAZO' | 'SIN_EXPEDIENTE';
}