import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

export class ScheduleDayDto {
    @ApiPropertyOptional({ description: 'ID del registro de horario (si ya existe)', example: 21 })
    @IsOptional()
    @IsInt()
    idHorario?: number;

    @ApiProperty({ description: 'Día de la semana', example: 'Lunes' })
    @IsString()
    @IsNotEmpty()
    DiaSemana: string;

    @ApiProperty({ description: 'Hora de entrada en formato ISO o Time', example: '1970-01-01T09:00:00.000Z' })
    @IsDateString()
    @IsNotEmpty()
    HoraEntrada: string;

    @ApiProperty({ description: 'Hora de salida en formato ISO o Time', example: '1970-01-01T18:00:00.000Z' })
    @IsDateString()
    @IsNotEmpty()
    HoraSalida: string;

    @ApiProperty({ description: 'Modalidad específica del día', example: 'REMOTO', enum: ['PRESENCIAL', 'REMOTO'] })
    @IsString()
    @IsNotEmpty()
    Modalidad: string;
}

export class UpdateEmployeeScheduleDto {
    @ApiProperty({
        description: 'Modalidad general del colaborador',
        example: 'PRESENCIAL',
        enum: ['PRESENCIAL', 'HÍBRIDO', 'REMOTO'],
    })
    @IsString()
    @IsNotEmpty()
    ModalidadHorario: string;

    @ApiPropertyOptional({ description: 'ID del catálogo de modalidad de horario si se maneja por FK', example: 1 })
    @IsOptional()
    @IsInt()
    idModalidadHorario?: number;

    @ApiProperty({ description: 'Listado de días y horarios asignados', type: [ScheduleDayDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ScheduleDayDto)
    horarios: ScheduleDayDto[];
}