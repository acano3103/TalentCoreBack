import { IsString, IsNotEmpty, IsEmail, MinLength, IsOptional } from 'class-validator';

export class CreateTenantDto {
    @IsString()
    @IsNotEmpty()
    tenantName: string;

    @IsString()
    @IsNotEmpty()
    adminUsername: string;

    @IsString()
    @IsNotEmpty()
    adminFirstName: string;

    @IsString()
    @IsNotEmpty()
    adminLastName: string;

    @IsEmail()
    @IsNotEmpty()
    adminEmail: string;

    @IsString()
    @MinLength(4)
    adminPassword: string;

    @IsString()
    @IsOptional()
    adminPhone?: string;
}