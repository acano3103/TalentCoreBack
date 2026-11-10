import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBiometricPersonDto {
    @ApiProperty({ example: '3', description: 'departmentExternalId de ZKBio (de GET biometrics/departments)' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    departmentExternalId: string;

    @ApiPropertyOptional({ example: ['General'], description: 'Niveles de acceso de ZKBio. Si no se envían se usan los marcados como iniciales.' })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(20)
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    accessLevelExternalIds?: string[];
}
