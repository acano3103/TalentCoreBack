import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';

export class NativeQuizQuestionDto {
    @ApiProperty({ example: '¿Qué se necesita antes de usar los datos de un candidato?' })
    @IsString()
    @IsNotEmpty({ message: 'Cada pregunta debe tener texto' })
    @MaxLength(500)
    question: string;

    @ApiProperty({ example: ['Su consentimiento', 'Nada', 'Una copia del CV'] })
    @IsArray()
    @ArrayMinSize(2, { message: 'Cada pregunta debe tener al menos 2 opciones' })
    @ArrayMaxSize(6, { message: 'Cada pregunta puede tener máximo 6 opciones' })
    @IsString({ each: true })
    @IsNotEmpty({ each: true, message: 'Las opciones no pueden ir vacías' })
    @MaxLength(300, { each: true })
    options: string[];

    @ApiProperty({ example: 0, description: 'Índice de la opción correcta (empieza en 0)' })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    correctIndex: number;

    @ApiPropertyOptional({ example: 'La ley exige consentimiento expreso.' })
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    explanation?: string;
}

export class NativeLessonDto {
    @ApiProperty({ example: 'Consentimiento del candidato' })
    @IsString()
    @IsNotEmpty({ message: 'Cada lección debe tener título' })
    @MaxLength(255)
    titulo: string;

    @ApiPropertyOptional({ example: 'Al finalizar, el alumno podrá pedir el consentimiento correctamente.' })
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    objetivo?: string;

    @ApiProperty({ description: 'Texto de la lección. Cada párrafo (separado por una línea en blanco) se vuelve una slide de contenido.' })
    @IsString()
    @IsNotEmpty({ message: 'Cada lección debe tener contenido' })
    @MaxLength(20000)
    contenido: string;

    @ApiPropertyOptional({ example: ['Pedir consentimiento por escrito'] })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(10)
    @IsString({ each: true })
    @MaxLength(300, { each: true })
    puntosClave?: string[];

    @ApiPropertyOptional({ type: [NativeQuizQuestionDto] })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(20)
    @ValidateNested({ each: true })
    @Type(() => NativeQuizQuestionDto)
    quiz?: NativeQuizQuestionDto[];
}

export class NativeModuleDto {
    @ApiProperty({ example: 'Fundamentos' })
    @IsString()
    @IsNotEmpty({ message: 'Cada módulo debe tener título' })
    @MaxLength(255)
    titulo: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    objetivo?: string;

    @ApiProperty({ type: [NativeLessonDto] })
    @IsArray()
    @ArrayMinSize(1, { message: 'Cada módulo debe tener al menos una lección' })
    @ArrayMaxSize(30)
    @ValidateNested({ each: true })
    @Type(() => NativeLessonDto)
    lecciones: NativeLessonDto[];
}

export class SaveNativeContentDto {
    @ApiPropertyOptional({ example: 'Curso para reclutadores sobre manejo de datos personales.' })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    descripcion?: string;

    @ApiPropertyOptional({ example: 'Reclutadores' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    audiencia?: string;

    @ApiProperty({ type: [NativeModuleDto] })
    @IsArray()
    @ArrayMinSize(1, { message: 'El curso debe tener al menos un módulo' })
    @ArrayMaxSize(20)
    @ValidateNested({ each: true })
    @Type(() => NativeModuleDto)
    modulos: NativeModuleDto[];
}
