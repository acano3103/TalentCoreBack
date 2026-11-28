import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const PROPOSITOS = ['ingreso', 'puesto', 'promocion', 'cumplimiento'] as const;
const ESTADOS_LISTA = ['publicada', 'borrador'] as const;
const MODOS = ['incluir', 'excluir'] as const;

export class CrearRutaDto {
  @ApiProperty({ maxLength: 200 })
  @IsString({ message: 'El nombre debe ser texto.' })
  @MaxLength(200, { message: 'El nombre no puede pasar de 200 caracteres.' })
  nombre: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'La descripción debe ser texto.' })
  @MaxLength(8000, { message: 'La descripción es demasiado larga.' })
  descripcion?: string;

  @ApiProperty({ enum: PROPOSITOS })
  @IsIn(PROPOSITOS, { message: 'El propósito no es válido.' })
  proposito: (typeof PROPOSITOS)[number];
}

export class ActualizarRutaDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto.' })
  @MaxLength(200, { message: 'El nombre no puede pasar de 200 caracteres.' })
  nombre?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, valor) => valor !== null)
  @IsString({ message: 'La descripción debe ser texto.' })
  @MaxLength(8000, { message: 'La descripción es demasiado larga.' })
  descripcion?: string | null;

  @ApiPropertyOptional({ enum: PROPOSITOS })
  @IsOptional()
  @IsIn(PROPOSITOS, { message: 'El propósito no es válido.' })
  proposito?: (typeof PROPOSITOS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'Activo debe ser verdadero o falso.' })
  activo?: boolean;
}

export class ElementoVersionDto {
  @ApiProperty()
  @IsInt({ message: 'El curso debe ser un identificador.' })
  @Min(1)
  idCurso: number;

  @ApiProperty()
  @IsInt({ message: 'El orden del curso debe ser un entero.' })
  @Min(1)
  orden: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: 'Obligatorio debe ser verdadero o falso.' })
  obligatorio?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, valor) => valor !== null)
  @IsInt({ message: 'El prerrequisito debe ser un curso.' })
  @Min(1)
  idCursoPrerrequisito?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Null: el curso no vence.',
  })
  @IsOptional()
  @ValidateIf((_, valor) => valor !== null)
  @IsInt({ message: 'La vigencia debe ser un número de meses.' })
  @Min(1)
  vigenciaMeses?: number | null;
}

export class EtapaVersionDto {
  @ApiProperty({ maxLength: 200 })
  @IsString({ message: 'El nombre de la etapa debe ser texto.' })
  @MaxLength(200, {
    message: 'El nombre de la etapa no puede pasar de 200 caracteres.',
  })
  nombre: string;

  @ApiProperty()
  @IsInt({ message: 'El orden de la etapa debe ser un entero.' })
  @Min(1)
  orden: number;

  @ApiProperty()
  @IsInt({ message: 'El día de inicio debe ser un entero.' })
  @Min(0)
  diaInicio: number;

  @ApiProperty()
  @IsInt({ message: 'El día de fin debe ser un entero.' })
  @Min(0)
  diaFin: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiereEtapaAnterior?: boolean;

  @ApiProperty({ type: [ElementoVersionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ElementoVersionDto)
  elementos: ElementoVersionDto[];
}

export class AlcanceVersionDto {
  @ApiProperty({ enum: MODOS })
  @IsIn(MODOS, { message: 'El modo de alcance debe ser incluir o excluir.' })
  modo: (typeof MODOS)[number];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, valor) => valor !== null)
  @IsInt()
  @Min(1)
  idUnidadOperativa?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, valor) => valor !== null)
  @IsString()
  @MaxLength(150)
  estado?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, valor) => valor !== null)
  @IsInt()
  @Min(1)
  idSite?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, valor) => valor !== null)
  @IsInt()
  @Min(1)
  idPuesto?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, valor) => valor !== null)
  @IsInt()
  @Min(1)
  idArea?: number | null;
}

export class ReemplazarVersionDto {
  @ApiProperty({ type: [EtapaVersionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EtapaVersionDto)
  etapas: EtapaVersionDto[];

  @ApiProperty({ type: [AlcanceVersionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AlcanceVersionDto)
  alcance: AlcanceVersionDto[];
}

export class ListarRutasQuery {
  @ApiPropertyOptional({ enum: PROPOSITOS })
  @IsOptional()
  @IsIn(PROPOSITOS, { message: 'El propósito no es válido.' })
  proposito?: (typeof PROPOSITOS)[number];

  @ApiPropertyOptional({ enum: ESTADOS_LISTA })
  @IsOptional()
  @IsIn(ESTADOS_LISTA, { message: 'El estado debe ser publicada o borrador.' })
  estado?: (typeof ESTADOS_LISTA)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idSite?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idPuesto?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AsignarRutaDto {
  @ApiProperty({
    type: [Number],
    description: 'Empleados que recibirán la versión publicada.',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Indica al menos un empleado.' })
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  idEmpleados: number[];
}

export class PaginacionQuery {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
