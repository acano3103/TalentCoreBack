import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

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
}
