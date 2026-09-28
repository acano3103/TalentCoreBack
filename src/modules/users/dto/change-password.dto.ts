import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
    @ApiPropertyOptional({
        description: 'Contraseña actual del usuario (opcional si es primer inicio o cambio forzado)',
        example: 'Temporal123',
    })
    @IsOptional()
    @IsString()
    currentPassword?: string;

    @ApiProperty({
        description: 'Nueva contraseña que el usuario desea configurar (mínimo 5 caracteres)',
        example: 'MiNuevaPassSegura2026*',
        minLength: 5,
    })
    @IsNotEmpty({ message: 'La nueva contraseña es obligatoria' })
    @IsString()
    @MinLength(5, { message: 'La nueva contraseña debe tener al menos 5 caracteres' })
    newPassword: string;
}