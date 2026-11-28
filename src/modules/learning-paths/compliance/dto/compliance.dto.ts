import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

function aBooleano(valor: unknown): boolean | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  if (valor === true || valor === 'true' || valor === '1') return true;
  if (valor === false || valor === 'false' || valor === '0') return false;
  return undefined;
}

export class CumplimientoQuery {
  @ApiPropertyOptional({
    description:
      'La matriz y los vencimientos solo cuentan cursos obligatorios.',
  })
  @IsOptional()
  @Transform(({ value }) => aBooleano(value))
  soloObligatorios?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idSite?: number;
}

export class ListarDc3Query {
  @ApiPropertyOptional({ enum: ['pendiente', 'generada', 'entregada'] })
  @IsOptional()
  @IsIn(['pendiente', 'generada', 'entregada'])
  estatus?: 'pendiente' | 'generada' | 'entregada';
}

export class GenerarDc3Dto {
  @ApiPropertyOptional({
    type: [Number],
    description:
      'Constancias a generar. Si se omite, genera todas las pendientes.',
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  idsConstancia?: number[];
}

export class ListarDc4Query {
  @ApiPropertyOptional({
    description: 'Año de la etapa. Por defecto, el año en curso.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio?: number;
}

export class PrepararDc4Dto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idSite: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio?: number;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Cierre de la etapa. Si se omite, es el 31 de diciembre.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de cierre usa el formato AAAA-MM-DD.',
  })
  fechaCierreEtapa?: string;
}
