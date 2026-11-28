import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RecruitmentDashboardQueryDto {
    @ApiPropertyOptional({ description: 'YYYY-MM-DD (por defecto: 1 de enero del año actual)' })
    @IsOptional()
    @IsString()
    desde?: string;

    @ApiPropertyOptional({ description: 'YYYY-MM-DD (por defecto: hoy)' })
    @IsOptional()
    @IsString()
    hasta?: string;

    @ApiPropertyOptional({ description: 'Filtrar por área (del puesto de la vacante)' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idArea?: number;

    @ApiPropertyOptional({ description: 'Filtrar por ubicación / servicio (idSite de la vacante)' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idSite?: number;

    @ApiPropertyOptional({ description: 'Filtrar por puesto (idPuesto)' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idPuesto?: number;

    @ApiPropertyOptional({
        description: 'Filtrar por estado de vacante/requisición',
        enum: ['TODOS', 'ABIERTA', 'REQUISICION', 'CERRADA', 'RECHAZADA_CANCELADA'],
    })
    @IsOptional()
    @IsString()
    @IsIn(['TODOS', 'ABIERTA', 'REQUISICION', 'CERRADA', 'RECHAZADA_CANCELADA'])
    @MaxLength(30)
    estatusVacante?: 'TODOS' | 'ABIERTA' | 'REQUISICION' | 'CERRADA' | 'RECHAZADA_CANCELADA';
}