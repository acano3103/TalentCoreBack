import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateLocationDto {
    @IsNotEmpty()
    @IsString()
    @MaxLength(200)
    descripcion: string;

    @IsNotEmpty()
    @IsString()
    @MaxLength(5)
    codigo_postal: string;

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
    @MaxLength(150)
    colonia: string;

    @IsNotEmpty()
    @IsString()
    @MaxLength(30)
    numero_exterior: string;

    @IsNotEmpty()
    @IsString()
    @MaxLength(30)
    numero_interior: string;
}