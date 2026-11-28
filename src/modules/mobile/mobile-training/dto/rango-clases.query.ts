import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class RangoClasesQuery {
    @ApiPropertyOptional({ description: 'Inicio del rango, en ISO. Si se omite, hoy menos 30 días en la zona de la empresa.' })
    @IsOptional()
    @IsISO8601({}, { message: 'La fecha desde no es válida.' })
    desde?: string;

    @ApiPropertyOptional({ description: 'Fin del rango, en ISO. Si se omite, hoy más 60 días en la zona de la empresa.' })
    @IsOptional()
    @IsISO8601({}, { message: 'La fecha hasta no es válida.' })
    hasta?: string;
}
