import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const NIVELES_CURSO = ['Básico', 'Intermedio', 'Avanzado'] as const;

export class GenerateAiContentDto {
    @ApiProperty({
        example: 'Curso de técnicas de cierre para agentes de contact center de seguros, con ejemplos de objeciones reales.',
        description: 'Descripción de lo que debe enseñar el curso',
    })
    @IsNotEmpty({ message: 'El prompt es requerido' })
    @IsString()
    @MaxLength(2000, { message: 'El prompt no puede exceder 2000 caracteres' })
    prompt: string;

    @ApiPropertyOptional({ example: 3, default: 3, description: 'Número de módulos a generar (2 a 6)' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(2, { message: 'El mínimo de módulos es 2' })
    @Max(6, { message: 'El máximo de módulos es 6' })
    numModulos?: number = 3;

    @ApiPropertyOptional({ enum: NIVELES_CURSO, example: 'Intermedio', default: 'Intermedio' })
    @IsOptional()
    @IsIn(NIVELES_CURSO, { message: 'El nivel debe ser Básico, Intermedio o Avanzado' })
    nivel?: string = 'Intermedio';

    @ApiPropertyOptional({ example: 'Español México', default: 'Español México' })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    idioma?: string = 'Español México';
}
