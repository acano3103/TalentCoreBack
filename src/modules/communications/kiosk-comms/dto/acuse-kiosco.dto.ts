import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class PendientesKioscoQuery {
    @ApiProperty()
    @Type(() => Number)
    @IsInt({ message: 'El empleado debe ser un identificador entero.' })
    @Min(1, { message: 'El empleado debe ser mayor a cero.' })
    idEmpleado: number;
}

export class AcuseKioscoDto {
    @ApiProperty()
    @Type(() => Number)
    @IsInt({ message: 'El empleado debe ser un identificador entero.' })
    @Min(1, { message: 'El empleado debe ser mayor a cero.' })
    idEmpleado: number;

    @ApiProperty()
    @Type(() => Number)
    @IsInt({ message: 'La checada debe ser un identificador entero.' })
    @Min(1, { message: 'La checada debe ser mayor a cero.' })
    idRegistroAsistencia: number;
}
