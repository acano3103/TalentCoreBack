import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class CreatePostulacionDto {
  @ApiProperty({
    type: 'number',
    example: 179,
    description: 'Empleado que se postula a la ruta de carrera',
  })
  @IsNotEmpty({ message: 'Empleado es requerido' })
  @IsNumber()
  idEmpleado: number;

  @ApiProperty({
    type: 'number',
    example: 1,
    description: 'Ruta de crecimiento a la que se postula',
  })
  @IsNotEmpty({ message: 'Ruta es requerida' })
  @IsNumber()
  idRuta: number;
}
