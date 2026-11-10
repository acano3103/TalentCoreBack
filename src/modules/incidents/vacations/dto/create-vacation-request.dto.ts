import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsPositive,
    IsString,
    MaxLength,
    Min,
} from 'class-validator';

export class CreateVacationRequestDto {
    @ApiProperty({ description: 'ID del empleado para quien se solicita la vacación', example: 1 })
    @IsInt()
    @IsPositive()
    @IsNotEmpty()
    idEmpleado: number;

    @ApiProperty({ description: 'Fecha de inicio (primer día ausente) en formato YYYY-MM-DD', example: '2026-11-15' })
    @IsDateString()
    @IsNotEmpty()
    fechaInicio: string;

    @ApiProperty({ description: 'Fecha de reincorporación (retorno laboral) en formato YYYY-MM-DD', example: '2026-11-20' })
    @IsDateString()
    @IsNotEmpty()
    fechaFin: string;

    @ApiProperty({ description: 'Total de días hábiles/laborales a descontar del saldo', example: 5 })
    @IsNumber()
    @Min(0.5)
    @IsNotEmpty()
    totalDiasLaborales: number;

    @ApiProperty({ description: 'Indica si la solicitud fue registrada por un líder para un subordinado', example: false })
    @IsBoolean()
    @IsNotEmpty()
    solicitadoPorLider: boolean;

    @ApiPropertyOptional({ description: 'Comentarios u observaciones adicionales del solicitante', example: 'Vacaciones correspondientes a periodo anual' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    comentarios?: string;
}