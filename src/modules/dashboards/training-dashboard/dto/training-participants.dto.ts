import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const ESTATUS_FILTRO = ['aprobado', 'reprobado', 'en_progreso', 'sin_iniciar', 'vencido', 'no_asistio', 'en_riesgo'] as const;
export const ORDEN_CAMPOS = ['empleado', 'curso', 'area', 'estatus', 'inicio', 'tiempo', 'calificacion', 'conclusion', 'inactividad'] as const;

export class TrainingParticipantsFiltersDto {
    @ApiPropertyOptional({ description: 'YYYY-MM-DD' }) @IsOptional() @IsString() desde?: string;
    @ApiPropertyOptional({ description: 'YYYY-MM-DD' }) @IsOptional() @IsString() hasta?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() idCurso?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() idArea?: string;
    @ApiPropertyOptional({ enum: ['presencial', 'online_sincrono', 'online_asincrono'] }) @IsOptional() @IsString() modalidad?: string;

    @ApiPropertyOptional({ enum: ESTATUS_FILTRO })
    @IsOptional()
    @IsIn(ESTATUS_FILTRO, { message: `El estatus debe ser: ${ESTATUS_FILTRO.join(', ')}` })
    estatus?: (typeof ESTATUS_FILTRO)[number];

    @ApiPropertyOptional({ description: 'Nombre o número de empleado' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string;
}

export class TrainingParticipantsQueryDto extends TrainingParticipantsFiltersDto {
    @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
    @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 20;

    @ApiPropertyOptional({ enum: ORDEN_CAMPOS, default: 'empleado' })
    @IsOptional()
    @IsIn(ORDEN_CAMPOS)
    sortBy: (typeof ORDEN_CAMPOS)[number] = 'empleado';

    @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
    @IsOptional()
    @IsIn(['asc', 'desc'])
    sortDir: 'asc' | 'desc' = 'asc';
}
