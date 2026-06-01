import { IsString, IsEmail, IsBoolean, IsInt, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
    @ApiPropertyOptional({ example: 'Juan', description: 'Nombre del usuario' })
    @IsOptional()
    @IsString()
    @MaxLength(150)
    first_name?: string;

    @ApiPropertyOptional({ example: 'Pérez', description: 'Apellido del usuario' })
    @IsOptional()
    @IsString()
    @MaxLength(150)
    last_name?: string;

    @ApiPropertyOptional({ example: 'juan@ejemplo.com', description: 'Correo electrónico' })
    @IsOptional()
    @IsEmail()
    @MaxLength(254)
    email?: string;

    @ApiPropertyOptional({ example: true, description: 'Estado activo/inactivo del usuario' })
    @IsOptional()
    @IsBoolean()
    is_active?: boolean;

    @ApiPropertyOptional({ example: 2, description: 'ID del nuevo rol desde catroles' })
    @IsOptional()
    @IsInt()
    idRol?: number;
}
