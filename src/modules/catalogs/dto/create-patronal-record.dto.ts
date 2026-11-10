import { IsNotEmpty, IsString, IsNumber, IsOptional, MaxLength, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePatronalRecordDto {
    @ApiProperty({ example: 'Y6412345101', description: 'Registro patronal ante el IMSS (11 caracteres)' })
    @IsNotEmpty()
    @IsString()
    @MaxLength(11)
    registroPatronal: string;

    @ApiProperty({ example: 'DATA VOICE S.A. DE C.V.' })
    @IsNotEmpty()
    @IsString()
    @MaxLength(255)
    razonSocial: string;

    @ApiProperty({ example: 'Clase I' })
    @IsNotEmpty()
    @IsString()
    @MaxLength(50)
    claseRiesgo: string;

    @ApiProperty({ example: 0.54355 })
    @IsNotEmpty()
    @IsNumber()
    @Min(0.05000)
    @Max(15.00000)
    primaRiesgo: number;

    @ApiProperty({ example: true, required: false })
    @IsOptional()
    activo?: boolean;
}