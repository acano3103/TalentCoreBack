import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsPositive,
    IsString,
    Matches,
    ValidateNested,
} from 'class-validator';

export class AttendanceSiteItemDto {
    @ApiProperty({ example: 1, description: 'ID de la sucursal o sede' })
    @IsNotEmpty()
    @IsInt()
    @IsPositive()
    idSite: number;

    @ApiPropertyOptional({
        example: 'IVR',
        enum: ['IVR', 'BIOMETRICO', 'APP_MOVIL'],
        nullable: true,
        description: 'Mecanismo de asistencia asignado en esta sede',
    })
    @IsOptional()
    @IsIn(['IVR', 'BIOMETRICO', 'APP_MOVIL', null])
    metodoAsistencia?: 'IVR' | 'BIOMETRICO' | 'APP_MOVIL' | null;
}

export class AttendanceDidExceptionItemDto {
    @ApiProperty({
        example: '5512345678',
        description: 'Número telefónico DID afectado (10 a 15 dígitos)',
    })
    @IsNotEmpty()
    @IsString()
    @Matches(/^\+?[0-9]{10,15}$/, {
        message: 'El DID debe contener entre 10 y 15 dígitos numéricos',
    })
    did: string;

    @ApiProperty({
        example: 'BLOQUEADO',
        enum: ['BLOQUEADO', 'EXTRA'],
        description: 'BLOQUEADO = deshabilitado para el empleado; EXTRA = número personalizado adicional',
    })
    @IsNotEmpty()
    @IsIn(['BLOQUEADO', 'EXTRA'])
    tipoExcepcion: 'BLOQUEADO' | 'EXTRA';

    @ApiProperty({
        example: true,
        description: 'Estatus activo de la regla de excepción',
    })
    @IsNotEmpty()
    @IsBoolean()
    activo: boolean;
}

export class UpdateAttendanceConfigDto {
    @ApiProperty({
        type: [AttendanceSiteItemDto],
        description: 'Lista de sedes autorizadas para marcaje de asistencia',
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AttendanceSiteItemDto)
    sedes: AttendanceSiteItemDto[];

    @ApiPropertyOptional({
        type: [AttendanceDidExceptionItemDto],
        description: 'Excepciones o números personalizados (DIDs bloqueados o extras)',
        default: [],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AttendanceDidExceptionItemDto)
    excepcionesDids?: AttendanceDidExceptionItemDto[];
}