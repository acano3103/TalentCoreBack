import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class MobileResendTokenDto {
    @ApiProperty({ example: 1 })
    @IsNumber()
    @IsNotEmpty()
    idUsuario: number;

    @ApiProperty({ example: 'staff', enum: ['staff', 'candidato'] })
    @IsString()
    @IsNotEmpty()
    userType: 'staff' | 'candidato';
}