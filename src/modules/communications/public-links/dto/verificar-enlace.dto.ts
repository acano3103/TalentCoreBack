import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class VerificarEnlaceDto {
    @ApiProperty({ example: '1990-05-20' })
    @IsString({ message: 'La fecha de nacimiento debe ser texto.' })
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha de nacimiento debe tener formato AAAA-MM-DD.' })
    fechaNacimiento: string;
}
