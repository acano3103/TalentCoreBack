import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';

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
