import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayNotEmpty,
    IsArray,
    IsIn,
    IsNotEmpty,
    IsString,
    Matches,
    ValidateNested,
} from 'class-validator';

export const DIAS_SEMANA_VALIDOS = [
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
    'Domingo',
] as const;

export class ScheduleDayItemDto {
    @ApiProperty({
        description: 'Día de la semana (Lunes a Domingo)',
        example: 'Lunes',
        enum: DIAS_SEMANA_VALIDOS,
    })
    @IsIn(DIAS_SEMANA_VALIDOS, {
        message: 'El día debe ser: Lunes, Martes, Miércoles, Jueves, Viernes, Sábado o Domingo',
    })
    @IsNotEmpty({ message: 'DiaSemana es obligatorio' })
    diaSemana: string;

    @ApiProperty({
        description: 'Hora de entrada en formato HH:mm o HH:mm:ss',
        example: '09:00:00',
    })
    @IsString({ message: 'HoraEntrada debe ser un string de tiempo' })
    @Matches(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, {
        message: 'HoraEntrada debe tener el formato HH:mm o HH:mm:ss',
    })
    @IsNotEmpty({ message: 'HoraEntrada es obligatoria' })
    horaEntrada: string;

    @ApiProperty({
        description: 'Hora de salida en formato HH:mm o HH:mm:ss',
        example: '18:00:00',
    })
    @IsString({ message: 'HoraSalida debe ser un string de tiempo' })
    @Matches(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, {
        message: 'HoraSalida debe tener el formato HH:mm o HH:mm:ss',
    })
    @IsNotEmpty({ message: 'HoraSalida es obligatoria' })
    horaSalida: string;
}

export class CreateScheduleCatalogDto {
    @ApiProperty({
        description: 'Nombre descriptivo del catálogo de horario',
        example: 'Turno Matutino 9 a 6',
    })
    @IsString({ message: 'El nombre debe ser una cadena de texto' })
    @IsNotEmpty({ message: 'El nombre es obligatorio' })
    nombre: string;

    @ApiProperty({
        description: 'Lista de días y sus horas asignadas para este horario',
        type: [ScheduleDayItemDto],
    })
    @IsArray({ message: 'Los días deben enviarse en un arreglo' })
    @ArrayNotEmpty({ message: 'Debe ingresar al menos un día para este horario' })
    @ValidateNested({ each: true })
    @Type(() => ScheduleDayItemDto)
    dias: ScheduleDayItemDto[];
}