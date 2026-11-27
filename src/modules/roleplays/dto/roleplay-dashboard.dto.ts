import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RoleplayDashboardQueryDto {
    @ApiPropertyOptional({ description: 'YYYY-MM-DD (fecha de asignación)' })
    @IsOptional()
    @IsDateString()
    desde?: string;

    @ApiPropertyOptional({ description: 'YYYY-MM-DD (fecha de asignación)' })
    @IsOptional()
    @IsDateString()
    hasta?: string;

    @ApiPropertyOptional({ description: 'Título del roleplay' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string;

    @ApiPropertyOptional({ description: 'Ubicación (sitio principal del empleado)' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idSite?: number;
}
