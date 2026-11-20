import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { TABS_BANDEJA } from '../bandeja';

export class BandejaCommsQuery {
    @ApiPropertyOptional({ enum: TABS_BANDEJA, default: 'pendientes' })
    @IsOptional()
    @IsIn(TABS_BANDEJA, { message: 'La pestaña debe ser pendientes, todos o archivados.' })
    tab?: (typeof TABS_BANDEJA)[number];

    @ApiPropertyOptional({ description: 'Id numérico del tipo, o su código.' })
    @IsOptional()
    @IsString({ message: 'El tipo debe ser texto.' })
    @MaxLength(40, { message: 'El tipo no puede pasar de 40 caracteres.' })
    tipo?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString({ message: 'La búsqueda debe ser texto.' })
    @MaxLength(120, { message: 'La búsqueda no puede pasar de 120 caracteres.' })
    search?: string;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'La página debe ser un entero.' })
    @Min(1, { message: 'La página debe ser al menos 1.' })
    page?: number;
}

export class PreguntaComunicadoDto {
    @ApiProperty({ maxLength: 1000 })
    @IsString({ message: 'La pregunta debe ser texto.' })
    @MinLength(1, { message: 'Escribe tu pregunta.' })
    @MaxLength(1000, { message: 'La pregunta no puede pasar de 1000 caracteres.' })
    pregunta: string;
}
