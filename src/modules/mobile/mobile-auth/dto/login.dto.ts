import { IsString, MinLength, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MobileLoginDto {

    @ApiProperty({
        description: 'Nombre de usuario o matrícula del empleado',
        example: 'user',
    })
    @IsString()
    @IsNotEmpty({ message: 'The username is required' })
    username: string;

    @ApiProperty({
        description: 'Contraseña del usuario',
        example: 'password',
    })
    @IsString()
    @MinLength(4, { message: 'The password must be at least 4 characters long' })
    password: string;

    @ApiProperty({
        description: 'Captcha token',
        example: 'captchaToken',
    })
    @IsString()
    @IsOptional()
    captchaToken?: string;

    @ApiProperty({
        description: 'Navegador',
        example: 'Chrome',
    })
    @IsString()
    @IsOptional()
    browser?: string;

    @ApiProperty({ description: 'Forzar cierre de sesión concurrente', required: false, default: false })
    @IsBoolean()
    @IsOptional()
    forceLogin?: boolean;
}