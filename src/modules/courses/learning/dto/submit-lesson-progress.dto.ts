import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, Min } from 'class-validator';

export class SubmitLessonProgressDto {
    @ApiPropertyOptional({
        description: 'Índice de la opción elegida por cada pregunta del quiz, en el mismo orden de las preguntas. Se omite si la lección no tiene quiz.',
        example: [2, 0, 1],
        type: [Number],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    @IsInt({ each: true })
    @Min(0, { each: true })
    answers?: number[];
}
