import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateRouteDto {
  @ApiProperty({
    type: 'number',
    example: 39,
    description: 'Puesto de origen de la ruta de crecimiento',
  })
  @IsNotEmpty({ message: 'Puesto origen es requerido' })
  @IsNumber()
  idPuestoOrigen: number;

  @ApiProperty({
    type: 'number',
    example: 40,
    description: 'Puesto objetivo/destino de la ruta de crecimiento',
  })
  @IsNotEmpty({ message: 'Puesto destino es requerido' })
  @IsNumber()
  idPuestoDestino: number;

  @ApiPropertyOptional({
    description: 'Meses mínimos en el puesto actual para este camino.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  antiguedadMinimaMeses?: number | null;

  @ApiPropertyOptional({
    description: 'Ruta de aprendizaje del puesto destino.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  idRutaAprendizaje?: number | null;
}
