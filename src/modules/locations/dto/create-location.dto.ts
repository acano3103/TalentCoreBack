import {
    IsNotEmpty,
    IsString,
    IsNumber,
    IsOptional,
    MaxLength,
    IsIn,
    IsArray,
    Matches
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLocationDto {
    @ApiProperty({ example: 'SUCURSAL CENTRO' })
    @IsNotEmpty()
    @IsString()
    @MaxLength(200)
    descripcion: string;

    @ApiProperty({ example: 1 })
    @IsNotEmpty()
    @IsNumber()
    idTipoUbicacion: number;

    @ApiPropertyOptional({ example: 1, description: 'ID de la Unidad Operativa (Opcional)' })
    @IsOptional()
    @IsNumber()
    idUnidadOperativa?: number;

    @ApiProperty({ example: 1, description: '1 para verdadero, 0 para falso' })
    @IsNotEmpty()
    @IsNumber()
    @IsIn([0, 1])
    esPrincipal: number;

    @ApiProperty({ example: '06000' })
    @IsNotEmpty()
    @IsString()
    @MaxLength(5)
    codigoPostal: string;

    @ApiProperty({ example: 'CIUDAD DE MÉXICO' })
    @IsNotEmpty()
    @IsString()
    @MaxLength(150)
    estado: string;

    @ApiProperty({ example: 'CUAUHTÉMOC' })
    @IsNotEmpty()
    @IsString()
    @MaxLength(150)
    municipio: string;

    @ApiProperty({ example: 'AV. JUÁREZ' })
    @IsNotEmpty()
    @IsString()
    @MaxLength(100)
    calle: string;

    @ApiProperty({ example: 'CENTRO' })
    @IsNotEmpty()
    @IsString()
    @MaxLength(100)
    colonia: string;

    @ApiProperty({ example: '12' })
    @IsNotEmpty()
    @IsString()
    @MaxLength(30)
    noExt: string;

    @ApiProperty({ example: 'PISO 3', required: false })
    @IsOptional()
    @IsString()
    @MaxLength(30)
    noInt?: string;

    @ApiProperty({ example: 'México' })
    @IsNotEmpty()
    @IsString()
    @MaxLength(60)
    pais: string;

    @ApiProperty({ example: 19.4326 })
    @IsNotEmpty()
    @IsNumber()
    latitud: number;

    @ApiProperty({ example: -99.1332 })
    @IsNotEmpty()
    @IsNumber()
    longitud: number;

    @ApiProperty({ example: 1, required: false })
    @IsOptional()
    @IsNumber()
    idRegistroPatronal?: number;

    @ApiProperty({ example: 0, required: false, description: '1 para verdadero, 0 para falso' })
    @IsOptional()
    @IsNumber()
    @IsIn([0, 1])
    zonaFronteriza?: number;

    @ApiPropertyOptional({
        example: 'IVR',
        enum: ['IVR', 'BIOMETRICO', 'APP_MOVIL'],
        nullable: true,
        description: 'Mecanismo de marcaje de asistencia de la sucursal (null si no maneja asistencia)'
    })
    @IsOptional()
    @IsIn(['IVR', 'BIOMETRICO', 'APP_MOVIL', null])
    tipoAsistencia?: 'IVR' | 'BIOMETRICO' | 'APP_MOVIL' | null;

    @ApiPropertyOptional({
        example: ['5512345678', '5598765432'],
        description: 'Lista de DIDs / Números telefónicos autorizados para marcar asistencia vía IVR',
        type: [String]
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Matches(/^\+?[0-9]{10,15}$/, {
        each: true,
        message: 'Cada DID debe ser un número telefónico válido de entre 10 y 15 dígitos',
    })
    dids?: string[];
}