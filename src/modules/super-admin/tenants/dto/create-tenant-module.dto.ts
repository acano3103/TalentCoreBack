import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

export class ModuloDataDto {
    @ApiProperty({ example: 'Gestión de Vacaciones' })
    @IsString()
    @IsNotEmpty()
    descripcion: string;

    @ApiProperty({ example: 'vacation-management' })
    @IsString()
    @IsNotEmpty()
    codigo: string;

    @ApiPropertyOptional({ example: 24, nullable: true })
    @IsOptional()
    @IsInt()
    idPadre?: number | null;

    @ApiPropertyOptional({ example: true, default: true })
    @IsOptional()
    @IsBoolean()
    activo?: boolean;
}

export class PermisoRolDto {
    @ApiProperty({ example: 1 })
    @IsInt()
    @IsNotEmpty()
    idRol: number;

    @ApiProperty({ example: true })
    @IsBoolean()
    puedeVer: boolean;

    @ApiProperty({ example: false })
    @IsBoolean()
    puedeCrear: boolean;

    @ApiProperty({ example: false })
    @IsBoolean()
    puedeActualizar: boolean;

    @ApiProperty({ example: false })
    @IsBoolean()
    puedeEliminar: boolean;
}

export class CreateTenantModuleDto {
    @ApiProperty({ type: ModuloDataDto })
    @ValidateNested()
    @Type(() => ModuloDataDto)
    @IsNotEmpty()
    modulo: ModuloDataDto;

    @ApiProperty({ type: [PermisoRolDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PermisoRolDto)
    permisos: PermisoRolDto[];
}