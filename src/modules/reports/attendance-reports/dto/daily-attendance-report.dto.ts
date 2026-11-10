import { IsOptional, IsString, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DailyAttendanceReportFilterDto {
    @ApiPropertyOptional({ description: 'Fecha inicial (YYYY-MM-DD)' })
    @IsOptional()
    @IsDateString()
    dateFrom?: string;

    @ApiPropertyOptional({ description: 'Fecha final (YYYY-MM-DD)' })
    @IsOptional()
    @IsDateString()
    dateTo?: string;

    @ApiPropertyOptional({ description: 'ID de la Ubicación (Site)' })
    @IsOptional()
    @IsString()
    idSite?: string;

    @ApiPropertyOptional({ description: 'ID del Área del empleado' })
    @IsOptional()
    @IsString()
    idArea?: string;

    @ApiPropertyOptional({ description: 'Búsqueda por nombre o número de nómina' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ description: 'Página de consulta', default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ description: 'Registros por página', default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 20;
}