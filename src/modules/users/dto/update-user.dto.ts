import { IsString, IsEmail, IsInt, IsOptional, MinLength, MaxLength, IsArray, ValidateNested, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserAccessDto } from './create-user.dto';

export class UpdateUserDto {
    @ApiPropertyOptional({ example: 'mguevara' })
    @IsOptional()
    @IsString()
    @MaxLength(150)
    username?: string; // 👈 Agregado para permitir recibirlo y validarlo

    @ApiPropertyOptional({ example: 'Michael' })
    @IsOptional()
    @IsString()
    @MaxLength(150)
    first_name?: string;

    @ApiPropertyOptional({ example: 'Guevara' })
    @IsOptional()
    @IsString()
    @MaxLength(150)
    last_name?: string;

    @ApiPropertyOptional({ example: 'juan@ejemplo.com' })
    @IsOptional()
    @IsEmail()
    @MaxLength(254)
    email?: string;

    @ApiPropertyOptional({ example: '5564306193' })
    @IsOptional()
    @IsString()
    @MaxLength(15)
    phone?: string;

    @ApiPropertyOptional({ example: 'NuevaContraseña123', minLength: 4 })
    @ValidateIf((o) => o.password !== '' && o.password !== undefined)
    @IsString()
    @MinLength(4)
    password?: string;

    @ApiPropertyOptional({ example: 1, description: '1 = Activo, 0 = Inactivo' })
    @IsOptional()
    @IsInt()
    is_active?: number;

    @ApiPropertyOptional({ example: 2 })
    @IsOptional()
    @IsInt()
    idRol?: number;

    @ApiPropertyOptional({ example: 135, nullable: true })
    @IsOptional()
    @IsInt()
    idEmpleado?: number | null;

    @ApiPropertyOptional({
        type: [UserAccessDto],
        description: 'Nueva estructura relacional de empresas y sites asignados',
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UserAccessDto)
    accesos?: UserAccessDto[];
}