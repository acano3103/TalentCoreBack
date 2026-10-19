
import { Type, Transform } from 'class-transformer';
import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

export enum PermissionSalaryType {
    CON_GOCE = 'CON_GOCE',
    SIN_GOCE = 'SIN_GOCE',
}

export enum PermissionDurationType {
    DIAS = 'DIAS',
    HORAS = 'HORAS',
}

const transformBoolean = ({ value }: { value: unknown }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
};

export class CreatePermissionDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idEmpleado: number;

    @IsString()
    tipoPermiso: string;

    @IsEnum(PermissionSalaryType)
    tipoGoce: PermissionSalaryType;

    @IsEnum(PermissionDurationType)
    tipoDuracion: PermissionDurationType;

    @IsString()
    fechaInicio: string;

    @IsOptional()
    @IsString()
    fechaFin?: string;

    @IsOptional()
    @IsString()
    horaInicio?: string;

    @IsOptional()
    @IsString()
    horaFin?: string;

    @IsOptional()
    @Transform(transformBoolean)
    @IsBoolean()
    regresaATrabajar?: boolean;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    duracion: number;

    @IsString()
    motivo: string;

    @IsOptional()
    @IsString()
    observaciones?: string;

    @Transform(transformBoolean)
    @IsBoolean()
    solicitadoPorLider: boolean;
}
