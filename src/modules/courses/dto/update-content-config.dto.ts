import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty } from 'class-validator';

export const MODOS_AVANCE = ['libre', 'video_completo', 'aprobar_quiz', 'video_y_quiz'] as const;
export type ModoAvance = (typeof MODOS_AVANCE)[number];

export class UpdateContentConfigDto {
    @ApiProperty({
        enum: MODOS_AVANCE,
        example: 'aprobar_quiz',
        description: 'Qué cierra una lección: libre, ver el video completo, aprobar el quiz, o video y quiz',
    })
    @IsNotEmpty({ message: 'El modo de avance es requerido' })
    @IsIn(MODOS_AVANCE, { message: 'El modoAvance debe ser libre, video_completo, aprobar_quiz o video_y_quiz' })
    modoAvance: ModoAvance;
}
