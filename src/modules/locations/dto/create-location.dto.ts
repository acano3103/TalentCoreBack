// src/locations/dto/create-location.dto.ts
import { IsNotEmpty, IsString, IsNumber, IsOptional, MaxLength } from 'class-validator';

export class CreateLocationDto {
    @IsNotEmpty()
    @IsString()
    @MaxLength(200)
    descripcion: string;

    @IsNotEmpty()
    @IsString()
    @MaxLength(5)
    codigoPostal: string;

    @IsNotEmpty()
    @IsString()
    @MaxLength(150)
    estado: string;

    @IsNotEmpty()
    @IsString()
    @MaxLength(150)
    municipio: string;

    @IsNotEmpty()
    @IsString()
    @MaxLength(100)
    calle: string;

    @IsNotEmpty()
    @IsString()
    @MaxLength(100)
    colonia: string;

    @IsNotEmpty()
    @IsString()
    @MaxLength(30)
    noExt: string;

    @IsOptional()
    @IsString()
    @MaxLength(30)
    noInt?: string;
}