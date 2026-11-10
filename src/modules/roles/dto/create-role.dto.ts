import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
    ArrayUnique,
    IsArray,
    IsDefined,
    IsNotEmpty,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { PermisoModuloDto } from './update-role.dto';

// Variante del DTO de descripcion del PUT: para crear un rol la descripcion es
// obligatoria (no opcional) y se recorta antes de validar, de modo que
// "   " no supere el IsNotEmpty y una descripcion de 100 caracteres rodeada de
// espacios no falle el MaxLength por los espacios.
export class RolDescripcionCreateDto {
    @ApiProperty({
        example: 'Supervisor de reclutamiento',
        description: 'Nombre del rol (requerido, maximo 100 caracteres, se guarda sin espacios al inicio o final)',
    })
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    descripcion: string;
}

export class CreateRoleDto {
    @ApiProperty({
        type: RolDescripcionCreateDto,
        description: 'Datos del rol a crear; la descripcion es requerida',
    })
    @IsDefined()
    @ValidateNested()
    @Type(() => RolDescripcionCreateDto)
    rol: RolDescripcionCreateDto;

    @ApiProperty({
        type: [PermisoModuloDto],
        description:
            'Permisos del rol (el campo es obligatorio pero puede venir vacio); cada modulo activo del ' +
            'tenant queda con una fila y los modulos ausentes se crean con los cuatro permisos en false',
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PermisoModuloDto)
    @ArrayUnique((permiso: PermisoModuloDto) => permiso.idModulo, {
        message: 'permisos: el mismo idModulo no puede repetirse en el payload.',
    })
    permisos: PermisoModuloDto[];
}
