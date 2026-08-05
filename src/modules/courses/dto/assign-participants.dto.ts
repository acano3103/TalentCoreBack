import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class AssignParticipantsDto {
    @ApiProperty({
        example: [101, 102, 105],
        description: 'Arreglo de IDs de empleados a inscribir en la sesión',
    })
    @IsArray()
    @ArrayMinSize(1, { message: 'Debe seleccionar al menos un empleado para inscribir.' })
    @Type(() => Number)
    @IsInt({ each: true })
    empleadosIds: number[];
}