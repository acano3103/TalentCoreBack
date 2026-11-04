import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MaxLength, Min, ValidateIf } from 'class-validator';
import { ARCHIVO_MATERIAL_REGEX } from '../course-materials.constants';

export class CourseMaterialDto {
    @ApiProperty({ example: '3f2b8c1e-8d4a-4a5e-9f0a-1b2c3d4e5f60' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(64)
    id: string;

    @ApiProperty({ enum: ['archivo', 'enlace'] })
    @IsIn(['archivo', 'enlace'])
    tipo: 'archivo' | 'enlace';

    @ApiProperty({ example: 'Guía de consulta.pdf' })
    @IsString()
    @IsNotEmpty({ message: 'Cada material debe tener nombre' })
    @MaxLength(255)
    nombre: string;

    @ApiPropertyOptional({ description: 'Nombre del archivo subido (solo tipo archivo)' })
    @ValidateIf((o) => o.tipo === 'archivo')
    @Matches(ARCHIVO_MATERIAL_REGEX, { message: 'El archivo del material no es válido' })
    archivo?: string;

    @ApiPropertyOptional({ enum: ['pdf', 'documento', 'imagen', 'video'] })
    @ValidateIf((o) => o.tipo === 'archivo')
    @IsIn(['pdf', 'documento', 'imagen', 'video'])
    formato?: 'pdf' | 'documento' | 'imagen' | 'video';

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(0)
    tamano?: number;

    @ApiPropertyOptional({ example: 'https://www.youtube.com/watch?v=xxxx' })
    @ValidateIf((o) => o.tipo === 'enlace')
    @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'La liga debe empezar con http:// o https://' })
    @MaxLength(1000)
    url?: string;
}
