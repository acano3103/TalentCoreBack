import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ActivateKioskDto {
    @ApiProperty({
        example: '7A92F4B18C23D5E6A1B09C4D8F2E6A10',
        description: 'Código de 32 hex del QR. Se aceptan minúsculas, espacios y guiones.',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(80)
    codigo: string;

    @ApiProperty({ example: 'tablet-recepcion-01', maxLength: 150 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    identificadorDispositivo: string;

    @ApiProperty({ example: 'android', maxLength: 20 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    plataforma: string;

    @ApiProperty({ example: 'Samsung Galaxy Tab A8', maxLength: 120 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    modelo: string;

    @ApiProperty({ example: '0.1.0', maxLength: 20 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    versionApp: string;
}
