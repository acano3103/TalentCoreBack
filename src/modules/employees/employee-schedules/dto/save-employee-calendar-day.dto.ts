import {
    ArrayMaxSize,
    IsArray,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum EmployeeCalendarDayType {
    LABORAL = 'LABORAL',
    DESCANSO = 'DESCANSO',
}

export class EmployeeCalendarShiftDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    numeroTurno?: number;

    @IsString()
    @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
        message: 'La hora de entrada debe tener el formato HH:mm o HH:mm:ss.',
    })
    HoraEntrada: string;

    @IsString()
    @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
        message: 'La hora de salida debe tener el formato HH:mm o HH:mm:ss.',
    })
    HoraSalida: string;

    @IsString()
    @MaxLength(100)
    Modalidad: string;
}

export class SaveEmployeeCalendarDayDto {
    @IsEnum(EmployeeCalendarDayType)
    tipoDia: EmployeeCalendarDayType;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    observaciones?: string;

    @IsArray()
    @ArrayMaxSize(10)
    @ValidateNested({ each: true })
    @Type(() => EmployeeCalendarShiftDto)
    turnos: EmployeeCalendarShiftDto[];
}