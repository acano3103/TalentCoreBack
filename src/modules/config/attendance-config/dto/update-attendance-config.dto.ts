import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsInt,
    IsNotEmptyObject,
    IsNumber,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';

export class ToleranciaDto {
    @ApiProperty({ example: 15, description: 'Minutos de tolerancia antes de retardo' })
    @IsInt()
    @Min(0)
    minutosToleranciaEntrada: number;

    @ApiProperty({ example: 60, description: 'Minutos límite antes de marcar falta' })
    @IsInt()
    @Min(0)
    minutosLimiteRetardo: number;

    @ApiProperty({ example: 3, description: 'Retardos acumulados equivalentes a una falta' })
    @IsInt()
    @Min(1)
    acumulacionRetardosParaFalta: number;
}

export class ComidaDto {
    @ApiProperty({ example: 60, description: 'Duración asignada de comida en minutos' })
    @IsInt()
    @Min(0)
    tiempoComidaMinutos: number;

    @ApiProperty({ example: 5, description: 'Tolerancia de retorno de comida en minutos' })
    @IsInt()
    @Min(0)
    toleranciaComidaMinutos: number;

    @ApiProperty({ example: true, description: 'Checada obligatoria de salida/entrada de comida' })
    @IsBoolean()
    obligatorioChecarComida: boolean;
}

export class SalidasDto {
    @ApiProperty({ example: 5, description: 'Tolerancia en minutos para salida anticipada' })
    @IsInt()
    @Min(0)
    toleranciaSalidaAnticipadaMinutos: number;
}

export class HorasExtraDto {
    @ApiProperty({ example: 30, description: 'Minutos mínimos después de jornada para computar tiempo extra' })
    @IsInt()
    @Min(0)
    minutosMinimosParaHoraExtra: number;

    @ApiProperty({ example: true, description: 'Requiere visto bueno previo para nómina' })
    @IsBoolean()
    requiereAprobacion: boolean;
}

export class MovilDto {
    @ApiProperty({ example: false, description: 'Permite checar fuera de geocerca con justificación' })
    @IsBoolean()
    permitirFueraGeocercaConJustificacion: boolean;

    @ApiProperty({ example: true, description: 'Exige selfie obligatoria al checar en la app' })
    @IsBoolean()
    selfieObligatoria: boolean;
}

export class UpdateAttendanceConfigDto {
    @ApiProperty({ type: ToleranciaDto })
    @IsNotEmptyObject()
    @ValidateNested()
    @Type(() => ToleranciaDto)
    tolerancia: ToleranciaDto;

    @ApiProperty({ type: ComidaDto })
    @IsNotEmptyObject()
    @ValidateNested()
    @Type(() => ComidaDto)
    comida: ComidaDto;

    @ApiProperty({ type: SalidasDto })
    @IsNotEmptyObject()
    @ValidateNested()
    @Type(() => SalidasDto)
    salidas: SalidasDto;

    @ApiProperty({ type: HorasExtraDto })
    @IsNotEmptyObject()
    @ValidateNested()
    @Type(() => HorasExtraDto)
    horasExtra: HorasExtraDto;

    @ApiProperty({ type: MovilDto })
    @IsNotEmptyObject()
    @ValidateNested()
    @Type(() => MovilDto)
    movil: MovilDto;
}