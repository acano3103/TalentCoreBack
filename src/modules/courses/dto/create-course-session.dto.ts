import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    IsArray,
    ValidateNested,
    Min,
    Max,
    IsDateString,
    ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FechaClaseDto {
    @ApiProperty({ example: 'Clase 1: Introducción' })
    @IsNotEmpty({ message: 'El título de la clase es requerido' })
    @IsString()
    tituloClase: string;

    @ApiProperty({ example: '2026-08-10T09:00:00' })
    @IsNotEmpty({ message: 'La fecha y hora de inicio es requerida' })
    @IsDateString({}, { message: 'La fechaHoraInicio debe ser un formato de fecha ISO válido' })
    fechaHoraInicio: string;

    @ApiProperty({ example: '2026-08-10T11:00:00' })
    @IsNotEmpty({ message: 'La fecha y hora de fin es requerida' })
    @IsDateString({}, { message: 'La fechaHoraFin debe ser un formato de fecha ISO válido' })
    fechaHoraFin: string;
}

export class CreateCourseSessionDto {
    @ApiProperty({ example: 18, description: 'ID del curso base (catálogo)' })
    @IsNotEmpty({ message: 'El idCurso es requerido' })
    @Type(() => Number)
    @IsInt()
    idCurso: number;

    @ApiProperty({ enum: ['presencial', 'online_sincrono'], example: 'presencial' })
    @IsNotEmpty({ message: 'La modalidad es requerida' })
    @IsEnum(['presencial', 'online_sincrono'], {
        message: 'La modalidad debe ser presencial o online_sincrono',
    })
    modalidad: 'presencial' | 'online_sincrono';

    @ApiProperty({ enum: ['interno', 'externo'], example: 'interno' })
    @IsNotEmpty({ message: 'El tipo de instructor es requerido' })
    @IsEnum(['interno', 'externo'], {
        message: 'El tipoInstructor debe ser interno o externo',
    })
    tipoInstructor: 'interno' | 'externo';

    @ApiPropertyOptional({ example: 105, description: 'ID del empleado si el instructor es interno' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    idEmpleadoInstructor?: number;

    @ApiPropertyOptional({ example: 'Juan Pérez', description: 'Nombre si el instructor es externo' })
    @IsOptional()
    @IsString()
    nombreInstructorExterno?: string;

    @ApiPropertyOptional({ example: 'Tech Training S.A.', description: 'Empresa si el instructor es externo' })
    @IsOptional()
    @IsString()
    empresaInstructorExterno?: string;

    @ApiProperty({ example: '2026-08-10T09:00:00' })
    @IsNotEmpty({ message: 'La fecha de inicio del periodo es requerida' })
    @IsDateString()
    fechaInicioPeriodo: string;

    @ApiProperty({ example: '2026-08-15T18:00:00' })
    @IsNotEmpty({ message: 'La fecha de fin del periodo es requerida' })
    @IsDateString()
    fechaFinPeriodo: string;

    @ApiPropertyOptional({ example: 'Sala A - Edificio Principal' })
    @IsOptional()
    @IsString()
    ubicacionFisica?: string;

    @ApiPropertyOptional({ example: 'https://teams.microsoft.com/l/meetup-join/...' })
    @IsOptional()
    @ValidateIf((o) => o.linkReunion !== '' && o.linkReunion !== null && o.linkReunion !== undefined)
    @IsUrl({}, { message: 'El linkReunion debe ser una URL válida' })
    linkReunion?: string;

    @ApiPropertyOptional({ example: 15, default: 15, description: 'Minutos antes para permitir el pase de lista con QR' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    minutosToleranciaQr?: number = 15;

    @ApiPropertyOptional({ example: 80, default: 80, description: 'Porcentaje mínimo de asistencia requerido' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(100)
    porcentajeAsistenciaMinimo?: number = 80;

    @ApiProperty({ type: [FechaClaseDto], description: 'Arreglo de fechas/clases multidía' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FechaClaseDto)
    fechasClase: FechaClaseDto[];
}