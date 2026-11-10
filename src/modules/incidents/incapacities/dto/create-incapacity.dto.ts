import { Transform, Type } from 'class-transformer';
import {
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
    Min,
} from 'class-validator';

const transformBoolean = ({
    value,
}: {
    value: unknown;
}) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
};

export class CreateIncapacityDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idEmpleado: number;

    @IsString()
    @MaxLength(50)
    tipoIncapacidad: string;

    @IsString()
    fechaInicio: string;

    @IsString()
    fechaFin: string;

    @IsInt()
    @Min(1)
    totalDiasLaborales: number;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    numeroCertificado?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    institucionMedica?: string;

    @IsOptional()
    @IsString()
    observaciones?: string;

    @Transform(transformBoolean)
    @IsBoolean()
    solicitadoPorLider: boolean;
}