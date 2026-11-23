import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class AnioStatsQuery {
    @ApiPropertyOptional({ example: 2026, description: 'Año calendario en la zona de la empresa. Si se omite, el año en curso.' })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'El año debe ser un entero.' })
    @Min(2000, { message: 'El año no es válido.' })
    @Max(2100, { message: 'El año no es válido.' })
    anio?: number;
}
