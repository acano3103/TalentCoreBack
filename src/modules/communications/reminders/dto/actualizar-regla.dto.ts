import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { CANALES } from '../../channels/canales';

export class ActualizarReglaDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean({ message: 'Activo debe ser verdadero o falso.' })
    activo?: boolean;

    @ApiPropertyOptional({ type: 'object', additionalProperties: true })
    @IsOptional()
    @IsObject({ message: 'Los parámetros deben ser un objeto.' })
    parametros?: Record<string, unknown>;

    @ApiPropertyOptional({ enum: CANALES, isArray: true })
    @IsOptional()
    @IsArray({ message: 'Los canales deben ser una lista.' })
    @IsIn(CANALES, { each: true, message: 'Hay un canal que no reconocemos.' })
    canales?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString({ message: 'La plantilla debe ser texto.' })
    @MinLength(1, { message: 'La plantilla no puede ir vacía.' })
    @MaxLength(500, { message: 'La plantilla no puede pasar de 500 caracteres.' })
    plantilla?: string;

    @ApiPropertyOptional({ type: [Number], nullable: true })
    @IsOptional()
    @IsArray({ message: 'Los tipos de personal deben ser una lista.' })
    @IsInt({ each: true, message: 'Cada tipo de personal debe ser un entero.' })
    @Min(1, { each: true, message: 'Cada tipo de personal debe ser mayor a cero.' })
    aplicaTiposPersonal?: number[] | null;

    @ApiPropertyOptional({ type: [Number], nullable: true })
    @IsOptional()
    @IsArray({ message: 'Las ubicaciones deben ser una lista.' })
    @IsInt({ each: true, message: 'Cada ubicación debe ser un entero.' })
    @Min(1, { each: true, message: 'Cada ubicación debe ser mayor a cero.' })
    excluyeSites?: number[] | null;
}
