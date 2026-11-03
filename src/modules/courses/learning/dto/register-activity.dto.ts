import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterActivityDto {
    @ApiProperty({
        enum: ['latido', 'abrir_leccion'],
        description: 'latido = el player sigue abierto y visible (cada 60 s); abrir_leccion = el empleado abrió una lección',
    })
    @IsIn(['latido', 'abrir_leccion'], { message: 'El tipo de actividad debe ser latido o abrir_leccion' })
    tipo: 'latido' | 'abrir_leccion';

    @ApiPropertyOptional({ example: 12, description: 'Requerido cuando tipo = abrir_leccion' })
    @ValidateIf((o) => o.tipo === 'abrir_leccion')
    @Type(() => Number)
    @IsInt({ message: 'El idLeccion debe ser un número entero' })
    idLeccion?: number;
}
