import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePositionTagDto {
    @ApiProperty({ example: 'Turno noche', description: 'Nombre de la etiqueta. Si ya existe en el tenant, se devuelve esa.' })
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
    @IsString({ message: 'El nombre de la etiqueta debe ser texto.' })
    @IsNotEmpty({ message: 'El nombre de la etiqueta es obligatorio.' })
    @MaxLength(60, { message: 'El nombre de la etiqueta no puede pasar de 60 caracteres.' })
    nombre: string;
}
