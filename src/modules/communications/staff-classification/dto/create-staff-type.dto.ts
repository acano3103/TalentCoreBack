import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateStaffTypeDto {
    @ApiProperty({ example: 'OPERATIVO', description: 'Código único dentro del tenant. Se guarda en mayúsculas.' })
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
    @IsString({ message: 'El código debe ser texto.' })
    @IsNotEmpty({ message: 'El código es obligatorio.' })
    @MaxLength(30, { message: 'El código no puede pasar de 30 caracteres.' })
    @Matches(/^[A-Z0-9_]+$/, { message: 'El código solo puede tener letras, números y guion bajo.' })
    codigo: string;

    @ApiProperty({ example: 'Operativo' })
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
    @IsString({ message: 'El nombre debe ser texto.' })
    @IsNotEmpty({ message: 'El nombre es obligatorio.' })
    @MaxLength(80, { message: 'El nombre no puede pasar de 80 caracteres.' })
    nombre: string;

    @ApiPropertyOptional({ default: true })
    @IsOptional()
    @IsBoolean({ message: 'El estado activo debe ser verdadero o falso.' })
    activo?: boolean;
}
