import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsArray, IsOptional } from 'class-validator';

export class ActiveUserDto {
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