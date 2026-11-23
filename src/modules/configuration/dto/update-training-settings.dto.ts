import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateTrainingSettingsDto {
  @ApiProperty({
    description:
      'Calificación mínima aprobatoria (0-100). Un valor de 10 o menos se lee como la escala antigua 0-10.',
    example: 70,
    minimum: 0,
    maximum: 100,
  })
  @IsInt()
  @Min(0)
  @Max(100)
  calificacionAprobatoria: number;
}
