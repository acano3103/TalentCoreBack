import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsArray, IsOptional, IsEmail } from 'class-validator';

export class UserFullInfoDto {
    @ApiProperty({ description: 'ID único del usuario (auth_user o usuarios)' })
    @IsNumber()
    id: number;

    @ApiProperty({ description: 'Nombre de usuario del empleado o candidato' })
    @IsString()
    username: string;

    @ApiProperty({ description: 'Listado de descripción de roles asignados', example: ['MASTER', 'ADMIN'] })
    @IsArray()
    @IsString({ each: true })
    roles: string[];

    @ApiProperty({ description: 'Módulos del sistema a los que tiene acceso permitido' })
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    modules?: string[];
}

export class ActiveUserDto {
    @ApiProperty({ description: 'ID único del usuario (auth_user o usuarios)' })
    @IsNumber()
    id: number;

    @ApiProperty({ description: 'ID único del usuario (auth_user o usuarios)' })
    @IsString()
    uuid: string

    @ApiProperty({ description: 'Nombre de usuario del empleado o candidato' })
    @IsString()
    username: string

    @ApiProperty({ description: 'Nombre del empleado o candidato' })
    @IsString()
    first_name: string

    @ApiProperty({ description: 'Apellido del empleado o candidato' })
    @IsString()
    last_name: string

    @ApiProperty({ description: 'Correo electrónico del empleado o candidato' })
    @IsString()
    @IsEmail()
    @IsOptional()
    email?: string

    @ApiProperty({ description: 'Teléfono del empleado o candidato' })
    @IsString()
    @IsOptional()
    phone?: string
}