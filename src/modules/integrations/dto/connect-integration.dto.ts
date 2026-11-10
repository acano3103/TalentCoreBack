import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConnectIntegrationDto {
    @ApiProperty({ example: '6avZ0UcjRmuK4O8Lx_xUAA' })
    @IsString()
    @IsOptional()
    clientId?: string;

    @ApiProperty({ example: 'hGd51Y4tlQfMN5gRgOncPDAj2GVSheDv' })
    @IsString()
    @IsOptional()
    clientSecret?: string;

    @ApiProperty({ example: 'ZZdhVndySgiUAs4Mu1V-9A' })
    @IsString()
    @IsOptional()
    accountId?: string;

    @ApiProperty({ example: 'sk-proj-P5k6p6q6q6q6q6q6q6q6q6q6q6q6q6q6q6q6q6q6q6q6q6q6q6q6q6q6q6q6q6q6' })
    @IsString()
    @IsOptional()
    apiKey?: string;

    // Solo Biométricos ZKBio: departamento padre de la empresa en ZKBio (delimita los departamentos que puede usar)
    @ApiPropertyOptional({ example: '4' })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    departamentoPadreExternalId?: string;
}