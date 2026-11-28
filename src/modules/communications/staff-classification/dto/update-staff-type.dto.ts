import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateStaffTypeDto {
    @ApiPropertyOptional({ example: 'DIRECTIVO' })
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
    @IsOptional()
    @IsString({ message: 'El código debe ser texto.' })
    @IsNotEmpty({ message: 'El código no puede ir vacío.' })
    @MaxLength(30, { message: 'El código no puede pasar de 30 caracteres.' })
    @Matches(/^[A-Z0-9_]+$/, { message: 'El código solo puede tener letras, números y guion bajo.' })
    codigo?: string;

    @ApiPropertyOptional({ example: 'Directivo' })
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
    @IsOptional()
    @IsString({ message: 'El nombre debe ser texto.' })
    @IsNotEmpty({ message: 'El nombre no puede ir vacío.' })
    @MaxLength(80, { message: 'El nombre no puede pasar de 80 caracteres.' })
    nombre?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean({ message: 'El estado activo debe ser verdadero o falso.' })
    activo?: boolean;
}
