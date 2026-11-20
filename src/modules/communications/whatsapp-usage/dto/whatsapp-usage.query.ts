import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class ResumenWhatsappQuery {
    @ApiPropertyOptional({ example: '2026-11' })
    @IsOptional()
    @IsString({ message: 'El mes debe ser texto.' })
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'El mes debe tener la forma AAAA-MM.' })
    mes?: string;

    @ApiPropertyOptional({ description: 'Empresa del tenant. Vacío suma las que están en tu alcance.' })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'La empresa debe ser un entero.' })
    @Min(1, { message: 'La empresa debe ser mayor a cero.' })
    empresa?: number;

    @ApiPropertyOptional({ example: 'RECORDATORIO' })
    @IsOptional()
    @IsString({ message: 'La categoría debe ser texto.' })
    @MaxLength(20, { message: 'La categoría no puede pasar de 20 caracteres.' })
    @Matches(/^[A-Za-z0-9_]+$/, { message: 'La categoría solo admite letras, números y guion bajo.' })
    categoria?: string;
}

export class MesesWhatsappQuery {
    @ApiPropertyOptional({ default: 6 })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'Los meses deben ser un entero.' })
    @Min(1, { message: 'Pide al menos un mes.' })
    @Max(24, { message: 'No se pueden pedir más de 24 meses.' })
    meses?: number;
}

export class ActualizarTopeDto {
    @ApiPropertyOptional({ nullable: true, description: 'Vacío o null: tope del tenant. Con id: tope de esa empresa.' })
    @IsOptional()
    @ValidateIf((_, valor) => valor !== null)
    @Type(() => Number)
    @IsInt({ message: 'La empresa debe ser un entero.' })
    @Min(1, { message: 'La empresa debe ser mayor a cero.' })
    idEmpresa?: number | null;

    @ApiProperty({ example: 1500 })
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El tope admite hasta 2 decimales.' })
    @Min(0, { message: 'El tope no puede ser negativo.' })
    topeMensual: number;

    @ApiProperty({ enum: ['BLOQUEAR', 'AVISAR'] })
    @IsString({ message: 'La acción debe ser texto.' })
    @Matches(/^(BLOQUEAR|AVISAR)$/, { message: 'La acción debe ser BLOQUEAR o AVISAR.' })
    accion: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean({ message: 'Activo debe ser verdadero o falso.' })
    activo?: boolean;
}
