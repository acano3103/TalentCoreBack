import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsInt } from 'class-validator';

export class CreateCompanyDto {
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
    rfc: string;

    @ApiProperty({ description: 'Postal Code' })
    @IsNotEmpty()
    @IsString()
    codigo_postal_empresa: string;

    @ApiProperty({ description: 'Geographical catalog neighborhood ID' })
    @IsNotEmpty()
    @Transform(({ value }) => parseInt(value, 10))
    @IsInt()
    colonia_empresa: number;

    @ApiPropertyOptional({ description: 'Neighborhood name text alternative' })
    @IsOptional()
    @IsString()
    colonia_empresa_text?: string;

    @ApiProperty({ description: 'Municipality' })
    @IsNotEmpty()
    @IsString()
    municipio_empresa: string;

    @ApiProperty({ description: 'State' })
    @IsNotEmpty()
    @IsString()
    estado_empresa: string;

    @ApiProperty({ description: 'Street address' })
    @IsNotEmpty()
    @IsString()
    calle_empresa: string;

    @ApiPropertyOptional({ description: 'Exterior building number' })
    @IsOptional()
    @IsString()
    numero_exterior_empresa?: string;

    @ApiPropertyOptional({ description: 'Interior suite/apartment number' })
    @IsOptional()
    @IsString()
    numero_interior_empresa?: string;

    @ApiPropertyOptional({ type: 'string', format: 'binary', description: 'Company brand logo file' })
    @IsOptional()
    logo_file?: any;
}