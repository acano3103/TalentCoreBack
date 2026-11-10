import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateTrainingSettingsDto {
  @ApiProperty({
    description: 'Calificación mínima aprobatoria de cursos (0-100)',
    example: 8,
    minimum: 0,
    maximum: 100,
  })
  @IsInt()
  @Min(0)
  @Max(100)
  calificacionAprobatoria: number;
}
