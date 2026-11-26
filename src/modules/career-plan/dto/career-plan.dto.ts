import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const ESTATUS_PLAN = [
  'en_preparacion',
  'listo_para_ascenso',
  'en_riesgo',
  'nominado',
  'promovido',
  'cancelado',
] as const;

export class UpdateRouteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  antiguedadMinimaMeses?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  idRutaAprendizaje?: number | null;
}

export class NominateDto {
  @ApiPropertyOptional({ example: '2026-12-01' })
  @IsOptional()
  @IsDateString()
  fechaEfectiva?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  motivo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  salarioBrutoNuevo?: number;
}

export class ListarColaboradoresQuery {
  @ApiPropertyOptional({ enum: ['mi_equipo'] })
  @IsOptional()
  @IsIn(['mi_equipo'])
  vista?: 'mi_equipo';

  @ApiPropertyOptional({ enum: ESTATUS_PLAN })
  @IsOptional()
  @IsIn(ESTATUS_PLAN)
  estatus?: (typeof ESTATUS_PLAN)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idRuta?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idSite?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class MapaCarreraQuery {
  @ApiPropertyOptional({
    description:
      'Si se envía, el mapa también incluye puestos con personas de esa área.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idArea?: number;
}
