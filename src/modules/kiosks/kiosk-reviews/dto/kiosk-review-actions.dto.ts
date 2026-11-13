import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
} from 'class-validator';

function texto(value: unknown): unknown {
    return typeof value === 'string' ? value.trim() : value;
}

export class ValidateRegistroDto {
    @ApiPropertyOptional({ description: 'Nota opcional de quien valida.' })
    @IsOptional()
    @Transform(({ value }) => texto(value))
    @IsString()
    @MaxLength(500)
    motivo?: string;
}

export class RejectRegistroDto {
    @ApiProperty({ description: 'Motivo del rechazo. Se guarda en la revisión.' })
    @Transform(({ value }) => texto(value))
    @IsString()
    @IsNotEmpty({ message: 'Escribe el motivo del rechazo.' })
    @MaxLength(500)
    motivo: string;
}

export class ReassignRegistroDto {
    @ApiProperty({ description: 'Empleado al que se reasigna la checada.' })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idEmpleado: number;

    @ApiProperty()
    @Transform(({ value }) => texto(value))
    @IsString()
    @IsNotEmpty({ message: 'Escribe el motivo de la reasignación.' })
    @MaxLength(500)
    motivo: string;
}

export class BulkValidateRegistrosDto {
    @ApiProperty({ type: [String], description: 'Identificadores de registro. Máximo 100.' })
    @Transform(({ value }) => (Array.isArray(value) ? value.map((item) => String(item).trim()) : value))
    @IsArray()
    @ArrayMinSize(1, { message: 'Indica al menos un registro.' })
    @ArrayMaxSize(100, { message: 'Solo puedes validar hasta 100 registros a la vez.' })
    @IsString({ each: true })
    @Matches(/^\d+$/, { each: true, message: 'Hay un identificador de registro inválido.' })
    ids: string[];
}

export class ApproveIncidenciaDto {
    @ApiPropertyOptional({
        description: 'Si es true, crea la relación activa del empleado con el site de la incidencia.',
    })
    @IsOptional()
    @IsBoolean()
    agregarEmpleadoSite?: boolean;
}

export class CorrectIncidenciaDto {
    @ApiProperty({ description: 'Empleado correcto, distinto del candidato.' })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    idEmpleado: number;

    @ApiProperty()
    @Transform(({ value }) => texto(value))
    @IsString()
    @IsNotEmpty({ message: 'Escribe el motivo de la corrección.' })
    @MaxLength(500)
    motivo: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    agregarEmpleadoSite?: boolean;
}

export class RejectIncidenciaDto {
    @ApiProperty()
    @Transform(({ value }) => texto(value))
    @IsString()
    @IsNotEmpty({ message: 'Escribe el motivo del rechazo.' })
    @MaxLength(500)
    motivo: string;
}
