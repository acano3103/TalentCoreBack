import { IsString, MinLength, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {

    @ApiProperty({ example: 'user' })
    @IsString()
    @IsNotEmpty({ message: 'The username is required' })
    username: string;

    @ApiProperty({ example: 'password' })
    @IsString()
    @MinLength(4, { message: 'The password must be at least 4 characters long' })
    password: string;

    @IsString()
    @IsOptional()
    captchaToken?: string;
}