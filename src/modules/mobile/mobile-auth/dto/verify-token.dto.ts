import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class MobileVerifyTokenDto {
    @ApiProperty({ example: 1 })
    @IsNumber()
    @IsNotEmpty()
    idUsuario: number;

    @ApiProperty({ example: '123456' })
    @IsString()
    @IsNotEmpty()
    token: string;

    @ApiProperty({ example: 'staff', enum: ['staff', 'candidato'] })
    @IsString()
    @IsNotEmpty()
    userType: 'staff' | 'candidato';
}