import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class HistorialQuery {
    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'La página debe ser un entero.' })
    @Min(1, { message: 'La página debe ser al menos 1.' })
    pagina?: number;

    @ApiPropertyOptional({ default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'El tamaño de página debe ser un entero.' })
    @Min(1, { message: 'El tamaño de página debe ser al menos 1.' })
    @Max(100, { message: 'El tamaño de página no puede pasar de 100.' })
    porPagina?: number;
}
