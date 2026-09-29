import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDeviceDto {
    @ApiProperty({
        description: 'Identificador único del dispositivo (IDFV, Android ID, etc.)',
        minLength: 8,
        maxLength: 120,
        example: 'a1b2c3d4e5f6g7h8',
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(8)
    @MaxLength(120)
    identificadorDispositivo: string;

    @ApiPropertyOptional({ enum: ['ios', 'android'], example: 'android' })
    @IsOptional()
    @IsIn(['ios', 'android'])
    plataforma?: 'ios' | 'android';

    @ApiPropertyOptional({ maxLength: 120, example: 'Pixel 8' })
    @IsOptional()
    @IsString()
    @MaxLength(120)
    modelo?: string;

    @ApiPropertyOptional({ maxLength: 20, example: '1.4.0' })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    versionApp?: string;

    @ApiPropertyOptional({ maxLength: 255 })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    pushToken?: string;
}
