
import { Transform, Type } from "class-transformer";
import {
    Allow,
    ArrayMaxSize,
    IsArray,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsString,
    Min,
    ValidateNested,
} from "class-validator";
import { BadRequestException } from "@nestjs/common";

function parseJsonField(value: unknown): unknown {
    if (typeof value !== "string") {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        throw new BadRequestException(
            "Uno de los campos JSON de la solicitud tiene un formato inválido."
        );
    }
}

export class StaffReductionFileMetadataDto {
    @Allow()
    @IsString()
    @IsNotEmpty()
    campo!: string;

    @Allow()
    @IsString()
    @IsNotEmpty()
    nombreArchivo!: string;

    @Allow()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    indice!: number;

    @Allow()
    @IsString()
    tipo!: string;

    @Allow()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    tamano!: number;
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

    @Transform(({ value }) => parseJsonField(value))
    @IsArray()
    @ArrayMaxSize(20)
    archivosMetadata!: StaffReductionFileMetadataDto[];
}
