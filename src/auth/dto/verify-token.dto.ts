import { IsString, IsInt, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyTokenDto {
    @ApiProperty({ example: 1 })
    @IsInt()
    idUsuario: number;

    @ApiProperty({ example: '124567' })
    @IsString()
    @Length(6, 6, { message: 'The code must be 6 digits' })
    token: string;

    @ApiProperty({ example: 'staff' })
    @IsString()
    userType: string;
}