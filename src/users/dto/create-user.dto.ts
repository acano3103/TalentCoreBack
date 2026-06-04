import { IsString, IsEmail, IsBoolean, IsInt, IsOptional, MinLength, MaxLength, IsNotEmpty, IsArray, ArrayMinSize, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
    @ApiProperty({ example: 'admin_jp' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    username: string;

    @ApiProperty({ example: 'Juan' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    first_name: string;

    @ApiProperty({ example: 'Pérez' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    last_name: string;

    @ApiProperty({ example: 'juan@ejemplo.com' })
    @IsEmail()
    @IsNotEmpty()
    @MaxLength(254)
    email: string;

    @ApiProperty({ example: '5551234567', required: false })
    @IsOptional()
    @IsString()
    @MaxLength(10)
    phone?: string;

    @ApiProperty({ example: 'MiContraseña123', minLength: 8 })
    @IsString()
    @IsNotEmpty()
    @MinLength(8)
    password: string;

    @ApiProperty({ example: true })
    @IsBoolean()
    is_active: boolean;

    @ApiProperty({ example: 2, description: 'ID del rol desde catroles' })
    @IsInt()
    idRol: number;

    /**
     * IDs de empresas a las que tendrá acceso el usuario,
     * o el string 'all' para otorgar acceso a todas.
     */
    @ApiProperty({
        example: [1, 2],
        description: "Array de IDs de empresas (CatEmpresas) o el string 'all' para todas",
        oneOf: [
            { type: 'array', items: { type: 'number' } },
            { type: 'string', enum: ['all'] },
        ],
    })
    @IsNotEmpty()
    empresaIds: number[] | 'all';

    @ApiProperty({ example: [1, 3], description: 'Array de IDs de sites (CatSites) a los que tendrá acceso el usuario' })
    @IsArray()
    @ArrayMinSize(0)
    @IsInt({ each: true })
    siteIds: number[];
}
