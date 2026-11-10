import { IsString, IsEmail, IsInt, IsOptional, MinLength, MaxLength, IsNotEmpty, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class UserAccessDto {
    @ApiProperty({ example: 1, description: 'ID de la empresa' })
    @IsInt()
    @IsNotEmpty()
    idEmpresa: number;

    @ApiProperty({ example: [1, 2, 3], description: 'IDs de los sites vinculados a esta empresa' })
    @IsArray()
    @IsInt({ each: true })
    ubicaciones: number[];
}

export class CreateUserDto {
    @ApiProperty({ example: 'acastro' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    username: string;

    @ApiProperty({ example: 'Michael' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    first_name: string;

    @ApiProperty({ example: 'Guevara' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    last_name: string;

    @ApiProperty({ example: 'juan@ejemplo.com' })
    @IsEmail()
    @IsNotEmpty()
    @MaxLength(254)
    email: string;

    @ApiProperty({ example: '5564306193', required: false })
    @IsString()
    @IsOptional()
    @MaxLength(15) // Aumentado a 15 por si mandan ladas o espacios
    phone: string;

    @ApiProperty({ example: 'MiContraseña123', minLength: 4 })
    @IsString()
    @IsNotEmpty()
    @MinLength(4) // Ajustado a 4 caracteres según tu último requerimiento
    password: string;

    @ApiProperty({ example: 1, description: 'Estatus del usuario (1 = Activo, 0 = Inactivo)' })
    @IsInt()
    @IsNotEmpty()
    is_active: number;

    @ApiProperty({ example: 0, description: 'Acceso al panel administrativo' })
    @IsInt()
    @IsNotEmpty()
    is_staff: number;

    @ApiProperty({ example: 0, description: 'Permisos globales de superusuario' })
    @IsInt()
    @IsNotEmpty()
    is_superuser: number;

    @ApiProperty({ example: 2, description: 'ID del rol asignado' })
    @IsInt()
    @IsNotEmpty()
    idRol: number;

    @ApiProperty({ example: 131, required: false, nullable: true, description: 'ID del empleado vinculado (Opcional)' })
    @IsInt()
    @IsOptional()
    idEmpleado: number | null;

    // 2. Reemplazo de los arreglos planos por la estructura relacional anidada
    @ApiProperty({
        type: [UserAccessDto],
        description: 'Estructura relacional de empresas y ubicaciones autorizadas',
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UserAccessDto) // Necesario para class-transformer
    @IsNotEmpty()
    accesos: UserAccessDto[];
}