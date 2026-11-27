import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class PersonnelDashboardQueryDto {
    @ApiPropertyOptional({ description: 'YYYY-MM-DD (por defecto: 1 de enero del año actual)' })
    @IsOptional()
    @IsString()
    desde?: string;

    @ApiPropertyOptional({ description: 'YYYY-MM-DD (por defecto: hoy)' })
    @IsOptional()
    @IsString()
    hasta?: string;

    @ApiPropertyOptional({ description: 'Filtrar por área (por el puesto o movimiento interno)' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idArea?: number;

    @ApiPropertyOptional({ description: 'Filtrar por ubicación (idSite)' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idSite?: number;

    @ApiPropertyOptional({
        description: 'Estatus del empleado: ACTIVO | INACTIVO | TODOS',
        enum: ['ACTIVO', 'INACTIVO', 'TODOS'],
    })
    @IsOptional()
    @IsString()
    @IsIn(['ACTIVO', 'INACTIVO', 'TODOS'])
    @MaxLength(20)
    estatusEmpleado?: 'ACTIVO' | 'INACTIVO' | 'TODOS';
}