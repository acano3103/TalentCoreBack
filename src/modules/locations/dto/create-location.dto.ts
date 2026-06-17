import { IsNotEmpty, IsString, IsNumber, IsOptional, MaxLength, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}