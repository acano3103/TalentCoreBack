import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';

export class RolDescripcionDto {
    @ApiPropertyOptional({
        example: 'Supervisor de reclutamiento',
        description: 'Nueva descripcion del rol (maximo 100 caracteres)',
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    descripcion?: string;
}

export class PermisoModuloDto {
    @ApiProperty({
        example: 12,
        description:
            'ID del modulo; debe existir en el catalogo, estar activo y pertenecer al tenant del usuario autenticado',
    })
    @IsInt()
    @IsNotEmpty()
    idModulo: number;

    @ApiProperty({ example: true, description: 'Permiso de ver (base de los demas permisos)' })
    @IsBoolean()
    ver: boolean;

    @ApiProperty({ example: false })
    @IsBoolean()
    crear: boolean;

    @ApiProperty({ example: false })
    @IsBoolean()
    editar: boolean;

    @ApiProperty({ example: false })
    @IsBoolean()
    eliminar: boolean;
}

export class UpdateRoleDto {
    @ApiPropertyOptional({
        type: RolDescripcionDto,
        description: 'Datos del rol a actualizar (solo descripcion); el id del rol viene del path',
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => RolDescripcionDto)
    rol?: RolDescripcionDto;

    @ApiProperty({
        type: [PermisoModuloDto],
        description:
            'Listado completo de permisos del rol; los modulos del rol que no vengan aqui se desactivan (soft delete)',
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PermisoModuloDto)
    @ArrayUnique((permiso: PermisoModuloDto) => permiso.idModulo, {
        message: 'permisos: el mismo idModulo no puede repetirse en el payload.',
    })
    permisos: PermisoModuloDto[];
}
