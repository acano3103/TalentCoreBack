import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayNotEmpty,
    IsArray,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

export enum TipoDispositivoEnum {
    BIOMETRICO = 'BIOMETRICO',
    IVR = 'IVR',
    NFC = 'NFC',
}

export class ArtemisDeviceItemDto {
    @ApiProperty({
        description: 'Identificador único del dispositivo en Artemis',
        example: 21,
    })
    @IsInt({ message: 'idDispositivo debe ser un número entero' })
    @IsNotEmpty({ message: 'idDispositivo es obligatorio' })
    idDispositivo: number;

    @ApiProperty({
        description: 'Tipo de dispositivo físico',
        enum: TipoDispositivoEnum,
        example: TipoDispositivoEnum.BIOMETRICO,
    })
    @IsEnum(TipoDispositivoEnum, {
        message: 'El tipo debe ser BIOMETRICO, IVR o NFC',
    })
    @IsNotEmpty({ message: 'tipo es obligatorio' })
    tipo: TipoDispositivoEnum;

    @ApiProperty({
        description: 'Nombre o alias asignado al dispositivo',
        example: 'Checador Entrada Principal',
    })
    @IsString({ message: 'alias debe ser una cadena de texto' })
    @IsNotEmpty({ message: 'alias es obligatorio' })
    alias: string;

    @ApiPropertyOptional({
        description: 'Modelo o referencia del dispositivo de hardware',
        example: 'ZKTeco SpeedFace-V5L',
        nullable: true,
    })
    @IsOptional()
    @IsString({ message: 'modelo debe ser una cadena de texto' })
    modelo?: string | null;
}

export class ArtemisSyncDevicesDto {
    @ApiProperty({
        description: 'Lista de dispositivos a registrar o actualizar',
        type: [ArtemisDeviceItemDto],
    })
    @IsArray({ message: 'dispositivos debe ser un arreglo' })
    @ArrayNotEmpty({ message: 'El arreglo de dispositivos no puede estar vacío' })
    @ValidateNested({ each: true })
    @Type(() => ArtemisDeviceItemDto)
    dispositivos: ArtemisDeviceItemDto[];
}