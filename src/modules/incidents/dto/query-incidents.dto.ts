import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SolicitudesIncidencias_estatus } from 'generated/prisma/enums';

export class QueryIncidentsDto {
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
    @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
    @IsString()
    search?: string;

    @ApiPropertyOptional({
        description: 'Filtrar por Estatus: PENDIENTE, APROBADA, RECHAZADA, CANCELADA',
        enum: SolicitudesIncidencias_estatus
    })
    @IsOptional()
    @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
    @IsEnum(SolicitudesIncidencias_estatus, {
        message: 'El estatus debe ser un valor válido o estar vacío',
    })
    status?: SolicitudesIncidencias_estatus;
}