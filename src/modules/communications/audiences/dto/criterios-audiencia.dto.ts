import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, Min, ValidateNested } from 'class-validator';

export class CriterioJefeDto {
    @ApiProperty({ example: 12 })
    @IsInt({ message: 'El jefe debe ser un identificador entero.' })
    @Min(1, { message: 'El jefe debe ser mayor a cero.' })
    idEmpleado: number;

    @ApiProperty({ enum: ['DIRECTO', 'ESTRUCTURA'] })
    @IsIn(['DIRECTO', 'ESTRUCTURA'], { message: 'El alcance del jefe debe ser DIRECTO o ESTRUCTURA.' })
    alcance: 'DIRECTO' | 'ESTRUCTURA';
}

export class CriteriosAudienciaDto {
    @ApiPropertyOptional({ type: [Number] })
    @IsOptional()
    @IsArray({ message: 'Las empresas deben ser una lista.' })
    @ArrayMaxSize(500, { message: 'La lista no puede tener más de 500 elementos.' })
    @IsInt({ each: true, message: 'Los identificadores deben ser enteros.' })
    @Min(1, { each: true, message: 'Los identificadores deben ser mayores a cero.' })
    empresas?: number[];

    @ApiPropertyOptional({ type: [Number] })
    @IsOptional()
    @IsArray({ message: 'Las unidades deben ser una lista.' })
    @ArrayMaxSize(500, { message: 'La lista no puede tener más de 500 elementos.' })
    @IsInt({ each: true, message: 'Los identificadores deben ser enteros.' })
    @Min(1, { each: true, message: 'Los identificadores deben ser mayores a cero.' })
    unidades?: number[];

    @ApiPropertyOptional({ type: [Number] })
    @IsOptional()
    @IsArray({ message: 'Las ubicaciones deben ser una lista.' })
    @ArrayMaxSize(500, { message: 'La lista no puede tener más de 500 elementos.' })
    @IsInt({ each: true, message: 'Los identificadores deben ser enteros.' })
    @Min(1, { each: true, message: 'Los identificadores deben ser mayores a cero.' })
    ubicaciones?: number[];

    @ApiPropertyOptional({ type: [Number] })
    @IsOptional()
    @IsArray({ message: 'Las áreas deben ser una lista.' })
    @ArrayMaxSize(500, { message: 'La lista no puede tener más de 500 elementos.' })
    @IsInt({ each: true, message: 'Los identificadores deben ser enteros.' })
    @Min(1, { each: true, message: 'Los identificadores deben ser mayores a cero.' })
    areas?: number[];

    @ApiPropertyOptional({ type: [Number] })
    @IsOptional()
    @IsArray({ message: 'Los puestos deben ser una lista.' })
    @ArrayMaxSize(500, { message: 'La lista no puede tener más de 500 elementos.' })
    @IsInt({ each: true, message: 'Los identificadores deben ser enteros.' })
    @Min(1, { each: true, message: 'Los identificadores deben ser mayores a cero.' })
    puestos?: number[];

    @ApiPropertyOptional({ type: [Number] })
    @IsOptional()
    @IsArray({ message: 'Las etiquetas deben ser una lista.' })
    @ArrayMaxSize(500, { message: 'La lista no puede tener más de 500 elementos.' })
    @IsInt({ each: true, message: 'Los identificadores deben ser enteros.' })
    @Min(1, { each: true, message: 'Los identificadores deben ser mayores a cero.' })
    etiquetas?: number[];

    @ApiPropertyOptional({ type: [Number] })
    @IsOptional()
    @IsArray({ message: 'Los tipos de personal deben ser una lista.' })
    @ArrayMaxSize(500, { message: 'La lista no puede tener más de 500 elementos.' })
    @IsInt({ each: true, message: 'Los identificadores deben ser enteros.' })
    @Min(1, { each: true, message: 'Los identificadores deben ser mayores a cero.' })
    tiposPersonal?: number[];

    @ApiPropertyOptional({ type: [Number] })
    @IsOptional()
    @IsArray({ message: 'Las campañas deben ser una lista.' })
    @ArrayMaxSize(500, { message: 'La lista no puede tener más de 500 elementos.' })
    @IsInt({ each: true, message: 'Los identificadores deben ser enteros.' })
    @Min(1, { each: true, message: 'Los identificadores deben ser mayores a cero.' })
    campanas?: number[];

    @ApiPropertyOptional({ type: [CriterioJefeDto] })
    @IsOptional()
    @IsArray({ message: 'Los jefes deben ser una lista.' })
    @ArrayMaxSize(500, { message: 'La lista no puede tener más de 500 elementos.' })
    @ValidateNested({ each: true })
    @Type(() => CriterioJefeDto)
    jefes?: CriterioJefeDto[];

    @ApiPropertyOptional({ type: [Number], description: 'Personas que se restan al final.' })
    @IsOptional()
    @IsArray({ message: 'La exclusión debe ser una lista.' })
    @ArrayMaxSize(500, { message: 'La lista no puede tener más de 500 elementos.' })
    @IsInt({ each: true, message: 'Los identificadores deben ser enteros.' })
    @Min(1, { each: true, message: 'Los identificadores deben ser mayores a cero.' })
    excluir?: number[];

    @ApiPropertyOptional({ type: [Number], description: 'Personas que se suman después de excluir.' })
    @IsOptional()
    @IsArray({ message: 'Las personas agregadas deben ser una lista.' })
    @ArrayMaxSize(500, { message: 'La lista no puede tener más de 500 elementos.' })
    @IsInt({ each: true, message: 'Los identificadores deben ser enteros.' })
    @Min(1, { each: true, message: 'Los identificadores deben ser mayores a cero.' })
    agregarEmpleados?: number[];
}
