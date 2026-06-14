import { IsString, IsInt, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendTokenDto {
    @ApiProperty({ example: 1 })
    @IsInt()
    idUsuario: number;

    @ApiProperty({ example: 'staff' })
    @IsString()
    userType: string;
}