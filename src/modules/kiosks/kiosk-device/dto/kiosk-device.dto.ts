import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsISO8601,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
    ValidateIf,
} from 'class-validator';

export class QueryRosterDto {
    @ApiPropertyOptional({
        description: 'Versión que ya tiene el equipo. Si coincide, no se reenvía el padrón.',
    })
    @IsOptional()
    @IsString()
    @MaxLength(64)
    version?: string;
}

export class QueryLookupEmpleadoDto {
    @ApiProperty({ example: '10025' })
    @Type(() => String)
    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    numero: string;
}

export class HeartbeatKioskDto {
    @ApiProperty({ example: 0, description: 'Checadas encoladas en el equipo sin sincronizar.' })
    @IsInt()
    @Min(0)
    pendientes: number;

    @ApiProperty({ example: '0.1.0', maxLength: 20 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    versionApp: string;

    @ApiPropertyOptional({ example: '2026-11-11T18:00:00.000Z' })
    @IsOptional()
    @ValidateIf((_, value) => value !== null && value !== undefined)
    @IsISO8601()
    ultimaSync?: string | null;
}

export class SubirEvidenciaKioscoDto {
    @ApiProperty({ enum: ['true', 'false'], description: 'Lo calcula la tablet al tomar la foto.' })
    @IsIn(['true', 'false'], { message: 'rostroDetectado debe ser true o false.' })
    rostroDetectado: 'true' | 'false';
}

export class ChecadaKioscoDto {
    @ApiProperty({ format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' })
    @IsUUID('4', { message: 'uuidCliente debe ser un UUID v4.' })
    uuidCliente: string;

    @ApiProperty({ enum: ['NUMERO'], example: 'NUMERO' })
    @IsIn(['NUMERO'], { message: 'metodoIdentificacion debe ser NUMERO.' })
    metodoIdentificacion: 'NUMERO';

    @ApiProperty({ example: '10025', maxLength: 20 })
    @IsString()
    @IsNotEmpty({ message: 'numeroEmpleado es obligatorio.' })
    @MaxLength(20)
    numeroEmpleado: string;

    @ApiProperty({ enum: ['ENTRADA', 'SALIDA'] })
    @IsIn(['ENTRADA', 'SALIDA'], { message: 'tipo debe ser ENTRADA o SALIDA.' })
    tipo: 'ENTRADA' | 'SALIDA';

    @ApiProperty({ example: '2026-11-11T18:00:00.000Z', description: 'ISO UTC, hora estimada del servidor en el equipo.' })
    @IsISO8601({}, { message: 'fechaHoraRegistro debe ser una fecha ISO.' })
    fechaHoraRegistro: string;

    @ApiPropertyOptional({ example: 81, nullable: true })
    @IsOptional()
    @IsInt()
    @Min(1)
    idEvidencia?: number | null;

    @ApiProperty({ example: false })
    @IsBoolean({ message: 'esOffline debe ser verdadero o falso.' })
    esOffline: boolean;

    @ApiPropertyOptional({ example: 12, nullable: true })
    @IsOptional()
    @IsInt()
    desfaseRelojSegundos?: number | null;
}

export class SyncKioskDto {
    @ApiProperty({
        type: [ChecadaKioscoDto],
        minItems: 1,
        maxItems: 50,
        description: 'Checadas encoladas. Se ordenan por fechaHoraRegistro. Un ítem inválido no tumba el lote.',
    })
    @IsArray({ message: 'El lote de checadas no es válido.' })
    @ArrayMinSize(1, { message: 'El lote debe incluir al menos un registro.' })
    @ArrayMaxSize(50, { message: 'El lote admite como máximo 50 registros.' })
    items: ChecadaKioscoDto[];
}

export interface ResultadoChecadaKiosco {
    resultado: 'REGISTRADO' | 'DUPLICADO' | 'POR_IDENTIFICAR';
    empleado: { nombreCorto: string; numeroEmpleado: string } | null;
    idRegistro: string | null;
    tipo: 'ENTRADA' | 'SALIDA';
    requiereRevision: boolean;
    advertencias: string[];
    mensaje: string;
}

export interface ResultadoSyncKiosco {
    uuidCliente: string;
    ok: boolean;
    resultado?: ResultadoChecadaKiosco;
    codigo?: string;
    mensaje?: string;
    reintentable: boolean;
}
