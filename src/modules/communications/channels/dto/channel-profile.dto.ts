import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { CANALES, Canal } from '../canales';

export class FilaMatrizDto {
    @ApiProperty()
    @IsInt({ message: 'El tipo de personal debe ser un entero.' })
    @Min(1, { message: 'El tipo de personal debe ser mayor a cero.' })
    idReferencia: number;

    @ApiProperty({ enum: CANALES, isArray: true })
    @IsArray({ message: 'Los canales deben ser una lista.' })
    @ArrayNotEmpty({ message: 'Indica al menos un canal.' })
    @IsIn(CANALES, { each: true, message: 'Hay un canal que no reconocemos.' })
    canales: Canal[];
}

export class MatrizCanalesDto {
    @ApiProperty({ type: [FilaMatrizDto] })
    @IsArray({ message: 'La matriz debe ser una lista.' })
    @ValidateNested({ each: true })
    @Type(() => FilaMatrizDto)
    filas: FilaMatrizDto[];
}

export class ExcepcionCanalDto {
    @ApiProperty({ enum: ['EMPLEADO', 'UBICACION'] })
    @IsIn(['EMPLEADO', 'UBICACION'], { message: 'La excepción es por persona o por ubicación.' })
    nivel: 'EMPLEADO' | 'UBICACION';

    @ApiProperty()
    @IsInt({ message: 'La referencia debe ser un entero.' })
    @Min(1, { message: 'La referencia debe ser mayor a cero.' })
    idReferencia: number;

    @ApiProperty({ enum: CANALES, isArray: true })
    @IsArray({ message: 'Los canales deben ser una lista.' })
    @ArrayNotEmpty({ message: 'Indica al menos un canal.' })
    @IsIn(CANALES, { each: true, message: 'Hay un canal que no reconocemos.' })
    canales: Canal[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString({ message: 'La nota debe ser texto.' })
    @MaxLength(200, { message: 'La nota no puede pasar de 200 caracteres.' })
    nota?: string;
}

export class ActualizarExcepcionDto {
    @ApiPropertyOptional({ enum: CANALES, isArray: true })
    @IsOptional()
    @IsArray({ message: 'Los canales deben ser una lista.' })
    @ArrayNotEmpty({ message: 'Indica al menos un canal.' })
    @IsIn(CANALES, { each: true, message: 'Hay un canal que no reconocemos.' })
    canales?: Canal[];

    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @ValidateIf((_, valor) => valor !== null)
    @IsString({ message: 'La nota debe ser texto.' })
    @MaxLength(200, { message: 'La nota no puede pasar de 200 caracteres.' })
    nota?: string | null;
}
