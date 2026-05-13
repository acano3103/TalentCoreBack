import { IsString, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConnectIntegrationDto {
    @ApiProperty({ example: '6avZ0UcjRmuK4O8Lx_xUAA' })
    @IsString()
    clientId: string;

    @ApiProperty({ example: 'hGd51Y4tlQfMN5gRgOncPDAj2GVSheDv' })
    @IsString()
    clientSecret: string;

    @ApiProperty({ example: 'ZZdhVndySgiUAs4Mu1V-9A' })
    @IsString()
    accountId: string;
}