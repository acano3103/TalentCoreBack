import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class HistorialRecordatoriosQuery {
    @ApiPropertyOptional({ example: 'R1' })
    @IsOptional()
    @IsString({ message: 'El código debe ser texto.' })
    @Matches(/^R(1[01]|[1-9])$/, { message: 'El código de la regla no es válido.' })
    codigo?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'El empleado debe ser un entero.' })
    @Min(1, { message: 'El empleado debe ser mayor a cero.' })
    idEmpleado?: number;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'La página debe ser un entero.' })
    @Min(1, { message: 'La página debe ser al menos 1.' })
    page?: number;
}
