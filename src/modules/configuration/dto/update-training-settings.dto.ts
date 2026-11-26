import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CARRERA_NOMINAN,
  CarreraNominador,
  ENTERO_CAPACITACION_MAX,
  RUTAS_APROBADOR,
  RUTAS_MODO_ASIGNACION,
  RUTAS_PLAZO_PRIMERA_PUBLICACION,
  RutasAprobador,
  RutasModoAsignacion,
  RutasPlazoPrimeraPublicacion,
} from '../training-config';

export class UpdateTrainingSettingsDto {
  @ApiPropertyOptional({
    description:
      'Calificación mínima aprobatoria (0-100). Un valor de 10 o menos se lee como la escala antigua 0-10.',
    example: 70,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  calificacionAprobatoria?: number;

  @ApiPropertyOptional({ enum: RUTAS_MODO_ASIGNACION, default: 'automatica' })
  @IsOptional()
  @IsIn(RUTAS_MODO_ASIGNACION, {
    message: 'El modo de asignación debe ser automatica o con_aprobacion.',
  })
  rutasModoAsignacion?: RutasModoAsignacion;

  @ApiPropertyOptional({
    enum: RUTAS_APROBADOR,
    description: 'Hoy se usa rh. El enum queda listo para jefe y ambos.',
    default: 'rh',
  })
  @IsOptional()
  @IsIn(RUTAS_APROBADOR, { message: 'El aprobador debe ser rh, jefe o ambos.' })
  rutasAprobador?: RutasAprobador;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: ENTERO_CAPACITACION_MAX,
    default: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(ENTERO_CAPACITACION_MAX)
  vigenciaVentanaDias?: number;

  @ApiPropertyOptional({ type: [Number], example: [30, 7] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(ENTERO_CAPACITACION_MAX, { each: true })
  vigenciaAvisosDias?: number[];

  @ApiPropertyOptional({
    enum: RUTAS_PLAZO_PRIMERA_PUBLICACION,
    default: 'publicacion',
  })
  @IsOptional()
  @IsIn(RUTAS_PLAZO_PRIMERA_PUBLICACION, {
    message:
      'El plazo de la primera publicación debe ser publicacion o ingreso.',
  })
  rutasPlazoPrimeraPublicacion?: RutasPlazoPrimeraPublicacion;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  dc3AutoGenerar?: boolean;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: ENTERO_CAPACITACION_MAX,
    default: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(ENTERO_CAPACITACION_MAX)
  dc3AvisoDiasHabiles?: number;

  @ApiPropertyOptional({
    description: 'Si no se guarda, el GET usa la razón social de la empresa.',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  dc3AgenteCapacitador?: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: ENTERO_CAPACITACION_MAX,
    default: 12,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(ENTERO_CAPACITACION_MAX)
  carreraAntiguedadDefaultMeses?: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: ENTERO_CAPACITACION_MAX,
    default: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(ENTERO_CAPACITACION_MAX)
  carreraDiasRenovacion?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  carreraRequierePlaza?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Sin uso en esta versión. Se guarda para no perder el valor.',
  })
  @IsOptional()
  @IsBoolean()
  carreraAutopostulacion?: boolean;

  @ApiPropertyOptional({
    enum: CARRERA_NOMINAN,
    isArray: true,
    example: ['rh', 'jefe'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(CARRERA_NOMINAN, {
    each: true,
    message: 'Quien nomina debe ser rh o jefe.',
  })
  carreraNominan?: CarreraNominador[];
}
