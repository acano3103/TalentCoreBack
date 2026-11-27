import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class OrganizationalDashboardQueryDto {
    @ApiPropertyOptional({ description: 'YYYY-MM-DD (por defecto: 1 de enero del año actual)' })
    @IsOptional()
    @IsString()
    desde?: string;

    @ApiPropertyOptional({ description: 'YYYY-MM-DD (por defecto: hoy)' })
    @IsOptional()
    @IsString()
    hasta?: string;

    @ApiPropertyOptional({ description: 'Área (por el puesto)' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idArea?: number;

    @ApiPropertyOptional({ description: 'Ubicación (sitio principal del empleado / de la vacante)' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idSite?: number;

    @ApiPropertyOptional({ description: 'Nivel organizacional: descripción de CatTipoPuesto' })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    nivel?: string;
}
