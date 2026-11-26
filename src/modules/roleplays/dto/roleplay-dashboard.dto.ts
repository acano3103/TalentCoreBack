import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
