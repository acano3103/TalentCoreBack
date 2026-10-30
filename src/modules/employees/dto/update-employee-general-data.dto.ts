import {
    IsDateString,
    IsEmail,
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateEmployeeGeneralDataDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    nombre?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    primerApellido?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    segundoApellido?: string;

    @IsOptional()
    @IsEmail()
    @MaxLength(250)
    correo?: string;

    @IsOptional()
    @IsString()
    @MaxLength(15)
    telefonoMovil?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    numeroEmpleado?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    idSite?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    idPuesto?: number;

    @IsOptional()
    @IsString()
    @MaxLength(18)
    rfc?: string;

    @IsOptional()
    @IsString()
    @MaxLength(15)
    numeroSeguroSocial?: string;

    @IsOptional()
    @IsString()
    @MaxLength(18)
    curp?: string;

    @IsOptional()
    @IsDateString()
    fechaNacimiento?: string;
}