
import {
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    Min,
    Max,
} from 'class-validator';

import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { KioscosAsistencia_estatus, KioscosAsistencia_modalidad } from 'generated/prisma/enums';

export class QueryKiosksDto {

    @ApiPropertyOptional({
        default: 1,
        description: 'Número de página.',
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page: number = 1;

    @ApiPropertyOptional({
        default: 10,
        description: 'Cantidad de registros por página. Máximo 100.',
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit: number = 10;

    @ApiPropertyOptional({
        description: 'Buscar por código, responsable o número de empleado.',
        example: 'KSK-A82F91C4',
    })
    @IsOptional()
    @Transform(({ value }) =>
        typeof value === 'string' && value.trim() === ''
            ? undefined
            : typeof value === 'string'
                ? value.trim()
                : value,
    )
    @IsString()
    search?: string;

    @ApiPropertyOptional({
        description: 'Filtrar por estatus del kiosco.',
        enum: KioscosAsistencia_estatus,
    })
    @IsOptional()
    @Transform(({ value }) =>
        typeof value === 'string' && value.trim() === ''
            ? undefined
            : value,
    )
    @IsEnum(KioscosAsistencia_estatus)
    status?: KioscosAsistencia_estatus;

    @ApiPropertyOptional({
        description: 'Filtrar por modalidad.',
        enum: KioscosAsistencia_modalidad,
    })
    @IsOptional()
    @Transform(({ value }) =>
        typeof value === 'string' && value.trim() === ''
            ? undefined
            : value,
    )
    @IsEnum(KioscosAsistencia_modalidad)
    modalidad?: KioscosAsistencia_modalidad;

    @ApiPropertyOptional({
        description: 'Filtrar por una ubicación específica.',
        example: 2,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idSite?: number;
}
