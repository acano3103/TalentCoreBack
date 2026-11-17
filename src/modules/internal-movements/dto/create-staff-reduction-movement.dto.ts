import { Transform, Type } from 'class-transformer';
import {
    Allow,
    ArrayMaxSize,
    IsArray,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import { BadRequestException } from '@nestjs/common';

function parseJsonField(value: unknown): unknown {
    if (typeof value !== 'string') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        throw new BadRequestException(
            'Uno de los campos JSON de la solicitud tiene un formato inválido.',
        );
    }
}

export class StaffReductionFileMetadataDto {
    @IsString()
    @IsNotEmpty()
    campo!: string;

    @IsString()
    @IsNotEmpty()
    nombreArchivo!: string;

    @Type(() => Number)
    @IsInt()
    @Min(0)
    indice!: number;

    @IsString()
    tipo!: string;

    @Type(() => Number)
    @IsInt()
    @Min(0)
    tamano!: number;
}

export class BajaDocumentoGeneradoDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    id!: number;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    templateId!: number;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    employeeId!: number;
}

export class CreateStaffReductionMovementDto {
    @Transform(({ value }) => Number(value))
    @IsInt()
    @Min(1)
    employeeId!: number;

    @IsString()
    @IsNotEmpty()
    causaBaja!: string;

    @IsString()
    @IsNotEmpty()
    motivo!: string;

    @Transform(({ value }) => parseJsonField(value))
    @IsObject()
    bajaDatos!: Record<string, string>;

    @IsOptional()
    @Transform(({ value }) => value === '' || value == null ? [] : parseJsonField(value))
    @IsArray()
    @ArrayMaxSize(20)
    @ValidateNested({ each: true })
    @Type(() => StaffReductionFileMetadataDto)
    archivosMetadata?: StaffReductionFileMetadataDto[];

    @IsOptional()
    @Transform(({ value }) => value === '' || value == null ? {} : parseJsonField(value))
    @IsObject()
    bajaDocumentosGenerados?: Record<string, BajaDocumentoGeneradoDto>;
}