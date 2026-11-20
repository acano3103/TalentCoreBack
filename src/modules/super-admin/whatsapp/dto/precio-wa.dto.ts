import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsNumber, IsObject, IsOptional, IsString, Length, Matches, Min, ValidateIf } from 'class-validator';

export class MesSuperadminQuery {
    @ApiPropertyOptional({ example: '2026-11' })
    @IsOptional()
    @IsString({ message: 'El mes debe ser texto.' })
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'El mes debe tener la forma AAAA-MM.' })
    mes?: string;
}

export class PreciosQuery {
    @ApiPropertyOptional({ description: 'Vacío lista todos. Con id, el historial de ese tenant y el precio global.' })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'El tenant debe ser un entero.' })
    @Min(1, { message: 'El tenant debe ser mayor a cero.' })
    idTenant?: number;
}

export class CrearPrecioDto {
    @ApiPropertyOptional({ nullable: true, description: 'Null crea el precio global.' })
    @IsOptional()
    @ValidateIf((_, valor) => valor !== null)
    @Type(() => Number)
    @IsInt({ message: 'El tenant debe ser un entero.' })
    @Min(1, { message: 'El tenant debe ser mayor a cero.' })
    idTenant?: number | null;

    @ApiProperty({ example: 0.85 })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'El precio admite hasta 4 decimales.' })
    @Min(0, { message: 'El precio no puede ser negativo.' })
    precioBase: number;

    @ApiPropertyOptional({ example: { CRITICA: 0.95, RECORDATORIO: 0.7 } })
    @IsOptional()
    @IsObject({ message: 'Los precios por categoría deben ser un objeto.' })
    preciosCategoria?: Record<string, number> | null;

    @ApiPropertyOptional({ example: 'MXN', default: 'MXN' })
    @IsOptional()
    @IsString({ message: 'La moneda debe ser texto.' })
    @Length(3, 3, { message: 'La moneda usa 3 letras.' })
    moneda?: string;

    @ApiProperty({ example: '2026-12-01T06:00:00.000Z' })
    @IsISO8601({}, { message: 'La vigencia debe ser una fecha.' })
    vigenteDesde: string;
}

export class TopeTenantDto {
    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @ValidateIf((_, valor) => valor !== null)
    @Type(() => Number)
    @IsInt({ message: 'La empresa debe ser un entero.' })
    @Min(1, { message: 'La empresa debe ser mayor a cero.' })
    idEmpresa?: number | null;

    @ApiProperty({ example: 5000 })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El tope admite hasta 2 decimales.' })
    @Min(0, { message: 'El tope no puede ser negativo.' })
    topeMensual: number;

    @ApiProperty({ enum: ['BLOQUEAR', 'AVISAR'] })
    @IsString({ message: 'La acción debe ser texto.' })
    @Matches(/^(BLOQUEAR|AVISAR)$/, { message: 'La acción debe ser BLOQUEAR o AVISAR.' })
    accion: string;
}
