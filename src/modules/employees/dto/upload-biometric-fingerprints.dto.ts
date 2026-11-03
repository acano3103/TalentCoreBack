import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsNotEmpty, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

// Una plantilla de huella tal como la genera el agente ZKTeco (ISSOnline)
export class BiometricFingerprintDto {
    @ApiProperty({ example: 6, description: 'Dedo (templateNo de CVAccess, 0 a 9)' })
    @IsInt()
    @Min(0)
    @Max(9)
    fingerIndex: number;

    @ApiProperty({ description: 'Plantilla en base64 generada por el agente' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(20000)
    @Matches(/^[A-Za-z0-9+/]+={0,2}$/, { message: 'templateBase64 debe ser base64 válido' })
    templateBase64: string;

    @ApiProperty({ example: '10', description: 'Versión del algoritmo sin decimales ("10", "12" o "13")' })
    @IsString()
    @Matches(/^\d{1,3}$/, { message: 'formatVersion debe ser numérica, por ejemplo "10"' })
    formatVersion: string;

    @ApiProperty({ example: false, description: 'Huella de coacción' })
    @IsBoolean()
    isDuress: boolean;
}

export class UploadBiometricFingerprintsDto {
    // Máximo 10 dedos con hasta 3 versiones de plantilla cada uno
    @ApiProperty({ type: [BiometricFingerprintDto] })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(30)
    @ValidateNested({ each: true })
    @Type(() => BiometricFingerprintDto)
    fingerprints: BiometricFingerprintDto[];
}
