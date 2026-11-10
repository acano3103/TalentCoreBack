import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsNumber,
    IsIn,
    IsEmail,
    MaxLength
} from 'class-validator';

// DTO para Creación
export class CreateOperatingUnitDto {
    @ApiPropertyOptional({ example: 'UO-001', description: 'Código o clave identificadora interna' })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    codigo?: string | null;

    @ApiProperty({ example: 'Operación Nissan Toluca', description: 'Nombre de la unidad u operación' })
    @IsNotEmpty({ message: 'El nombre de la unidad operativa es obligatorio' })
    @IsString()
    @MaxLength(200)
    nombre: string;

    @ApiPropertyOptional({ example: 'Centros de trabajo dentro de complejo industrial', description: 'Descripción o propósito operativo' })
    @IsOptional()
    @IsString()
    descripcion?: string | null;

    @ApiProperty({ example: 0, description: '1 = Instalación externa/tercero, 0 = Operación interna' })
    @IsNumber()
    @IsIn([0, 1], { message: 'El valor de esExterna debe ser 0 o 1' })
    esExterna: number;

    @ApiPropertyOptional({ example: 'Ing. Fernando Pérez', description: 'Responsable o contacto principal' })
    @IsOptional()
    @IsString()
    @MaxLength(150)
    responsableContacto?: string | null;

    @ApiPropertyOptional({ example: '5512345678', description: 'Teléfono de contacto' })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    telefonoContacto?: string | null;

    @ApiPropertyOptional({ example: 'fperez@empresa.com', description: 'Correo electrónico de contacto' })
    @IsOptional()
    @IsEmail({}, { message: 'El correo de contacto no tiene un formato válido' })
    @MaxLength(200)
    correoContacto?: string | null;

    @ApiPropertyOptional({ example: 1, default: 1, description: '1 = Activo, 0 = Inactivo' })
    @IsOptional()
    @IsNumber()
    @IsIn([0, 1], { message: 'El valor de activo debe ser 0 o 1' })
    activo?: number;
}