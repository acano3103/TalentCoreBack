import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { CORTES_DESGLOSE, ESTADOS_DESTINATARIO } from '../analitica';

export class DesgloseQuery {
    @ApiProperty({ enum: CORTES_DESGLOSE, description: 'Agrupa por el dato congelado al enviar.' })
    @IsIn(CORTES_DESGLOSE, { message: 'El desglose debe ser ubicación, área, puesto, tipo de personal o jefe.' })
    by: (typeof CORTES_DESGLOSE)[number];
}

export class DestinatariosQuery {
    @ApiPropertyOptional({ enum: ESTADOS_DESTINATARIO })
    @IsOptional()
    @IsIn(ESTADOS_DESTINATARIO, { message: 'El estado del destinatario no es válido.' })
    estado?: (typeof ESTADOS_DESTINATARIO)[number];

    @ApiPropertyOptional({ description: 'Ubicación congelada en el destinatario.' })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'La ubicación debe ser un identificador entero.' })
    @Min(1, { message: 'La ubicación debe ser mayor a cero.' })
    site?: number;

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

    @ApiPropertyOptional({ default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'El tamaño de página debe ser un entero.' })
    @Min(1, { message: 'El tamaño de página debe ser al menos 1.' })
    @Max(100, { message: 'El tamaño de página no puede pasar de 100.' })
    pageSize?: number;
}

export class ReenviarDto {
    @ApiProperty({ enum: ['PENDIENTES', 'SITE'] })
    @IsIn(['PENDIENTES', 'SITE'], { message: 'El alcance debe ser pendientes o una ubicación.' })
    alcance: 'PENDIENTES' | 'SITE';

    @ApiPropertyOptional({ description: 'Obligatorio cuando el alcance es la ubicación.' })
    @ValidateIf((dto: ReenviarDto) => dto.alcance === 'SITE')
    @Type(() => Number)
    @IsInt({ message: 'La ubicación debe ser un identificador entero.' })
    @Min(1, { message: 'Indica la ubicación para reenviar.' })
    idSite?: number;
}

export class ResponderPreguntaDto {
    @ApiProperty({ maxLength: 2000 })
    @IsString({ message: 'La respuesta debe ser texto.' })
    @MinLength(1, { message: 'Escribe la respuesta.' })
    @MaxLength(2000, { message: 'La respuesta no puede pasar de 2000 caracteres.' })
    respuesta: string;
}
