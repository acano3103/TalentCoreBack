import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsInt } from 'class-validator';

export class UpdateCompanyDto {
    @ApiProperty({ description: 'Legal entity name (auto-converted to UPPERCASE)' })
    @IsNotEmpty()
    @IsString()
    @Transform(({ value }) => value?.trim().toUpperCase())
    razon_social: string;

    @ApiProperty({ description: 'Commercial name (auto-converted to UPPERCASE)' })
    @IsNotEmpty()
    @IsString()
    @Transform(({ value }) => value?.trim().toUpperCase())
    nombre_comercial: string;

    @ApiProperty({ description: 'Contact email' })
    @IsNotEmpty()
    @IsEmail()
    correo: string;

    @ApiProperty({ description: 'Phone number' })
    @IsNotEmpty()
    @IsString()
    telefono: string;

    @ApiProperty({ description: 'Tax ID (RFC)' })
    @IsNotEmpty()
    @IsString()
    @Transform(({ value }) => value?.trim().toUpperCase())
    rfc: string;

    @ApiProperty({ description: 'Postal Code' })
    @IsNotEmpty()
    @IsString()
    codigo_postal: string;

    @ApiProperty({ description: 'Geographical catalog neighborhood ID' })
    @IsNotEmpty()
    @Transform(({ value }) => parseInt(value, 10))
    @IsInt()
    colonia: number;

    @ApiPropertyOptional({ description: 'Neighborhood text alternative (can be empty)' })
    @IsOptional()
    @IsString()
    colonia_text?: string;

    @ApiProperty({ description: 'Municipality' })
    @IsNotEmpty()
    @IsString()
    municipio: string;

    @ApiProperty({ description: 'State' })
    @IsNotEmpty()
    @IsString()
    estado: string;

    @ApiProperty({ description: 'Street address (auto-converted to UPPERCASE)' })
    @IsNotEmpty()
    @IsString()
    @Transform(({ value }) => value?.trim().toUpperCase())
    calle: string;

    @ApiPropertyOptional({ description: 'Exterior building number' })
    @IsOptional()
    @IsString()
    numero_exterior?: string;

    @ApiPropertyOptional({ description: 'Interior suite/apartment number' })
    @IsOptional()
    @IsString()
    numero_interior?: string;

    @ApiPropertyOptional({ type: 'string', format: 'binary', description: 'Optional new company brand logo file' })
    @IsOptional()
    logo_file?: any;
}