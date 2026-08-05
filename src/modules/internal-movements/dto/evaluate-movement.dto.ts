import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class EvaluateMovementDto {
  @ApiProperty({ enum: ['aprobar', 'rechazar'], description: 'Acción a realizar: aprobar o rechazar' })
  @IsNotEmpty()
  @IsEnum(['aprobar', 'rechazar'])
  action: 'aprobar' | 'rechazar';
}
