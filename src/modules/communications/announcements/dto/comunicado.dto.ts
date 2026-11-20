import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsIn,
    IsInt,
    IsISO8601,
    IsObject,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import { CriteriosAudienciaDto } from '../../audiences/dto/criterios-audiencia.dto';
import { CANALES } from '../../channels/canales';
import { ACUSES, LIMITE_CUERPO, LIMITE_RESUMEN, LIMITE_TITULO, PRIORIDADES } from '../contenido';

export class CamposComunicadoDto {
    @ApiPropertyOptional({ maxLength: LIMITE_TITULO })
    @IsOptional()
    @IsString({ message: 'El título debe ser texto.' })
    @MaxLength(LIMITE_TITULO, { message: `El título no puede pasar de ${LIMITE_TITULO} caracteres.` })
    titulo?: string;

    @ApiPropertyOptional({ maxLength: LIMITE_RESUMEN })
    @IsOptional()
    @IsString({ message: 'El resumen debe ser texto.' })
    @MaxLength(LIMITE_RESUMEN, { message: `El resumen no puede pasar de ${LIMITE_RESUMEN} caracteres.` })
    resumen?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString({ message: 'El cuerpo debe ser texto.' })
    @MaxLength(LIMITE_CUERPO, { message: `El cuerpo no puede pasar de ${LIMITE_CUERPO} caracteres.` })
    cuerpoHtml?: string;

    @ApiPropertyOptional({ enum: PRIORIDADES })
    @IsOptional()
    @IsIn(PRIORIDADES, { message: 'La prioridad no es válida.' })
    prioridad?: (typeof PRIORIDADES)[number];

    @ApiPropertyOptional({ enum: ACUSES })
    @IsOptional()
    @IsIn(ACUSES, { message: 'El modo de acuse no es válido.' })
    acuseModo?: (typeof ACUSES)[number];

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean({ message: 'El modal debe ser verdadero o falso.' })
    mostrarModal?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean({ message: 'La identidad debe ser verdadero o falso.' })
    requiereIdentidad?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean({ message: 'Incluir nuevos debe ser verdadero o falso.' })
    incluirNuevos?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean({ message: 'Permitir preguntas debe ser verdadero o falso.' })
    permitePregunta?: boolean;

    @ApiPropertyOptional({ enum: CANALES, isArray: true })
    @IsOptional()
    @IsIn(CANALES, { each: true, message: 'Hay un canal que no reconocemos.' })
    canalesForzados?: (typeof CANALES)[number][];

    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @ValidateIf((_, valor) => valor !== null)
    @IsObject({ message: 'El escalamiento debe ser un objeto.' })
    escalamiento?: Record<string, unknown> | null;

    @ApiPropertyOptional()
    @IsOptional()
    @ValidateIf((_, valor) => valor !== null)
    @IsInt({ message: 'Los días del recordatorio deben ser un entero.' })
    @Min(1, { message: 'Los días del recordatorio deben ser al menos 1.' })
    @Max(365, { message: 'Los días del recordatorio no pueden pasar de 365.' })
    recordatorioCadaDias?: number | null;

    @ApiPropertyOptional()
    @IsOptional()
    @ValidateIf((_, valor) => valor !== null)
    @IsInt({ message: 'El máximo de recordatorios debe ser un entero.' })
    @Min(1, { message: 'El máximo de recordatorios debe ser al menos 1.' })
    @Max(20, { message: 'El máximo de recordatorios no puede pasar de 20.' })
    recordatorioMax?: number | null;

    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @ValidateIf((_, valor) => valor !== null)
    @IsString({ message: 'El tipo de botón debe ser texto.' })
    @MaxLength(40, { message: 'El tipo de botón no puede pasar de 40 caracteres.' })
    ctaTipo?: string | null;

    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @ValidateIf((_, valor) => valor !== null)
    @IsString({ message: 'El texto del botón debe ser texto.' })
    @MaxLength(60, { message: 'El texto del botón no puede pasar de 60 caracteres.' })
    ctaTexto?: string | null;

    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @ValidateIf((_, valor) => valor !== null)
    @IsString({ message: 'El destino del botón debe ser texto.' })
    @MaxLength(500, { message: 'El destino del botón no puede pasar de 500 caracteres.' })
    ctaDestino?: string | null;

    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @ValidateIf((_, valor) => valor !== null)
    @IsString({ message: 'La categoría debe ser texto.' })
    @MaxLength(60, { message: 'La categoría no puede pasar de 60 caracteres.' })
    categoria?: string | null;

    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @ValidateIf((_, valor) => valor !== null)
    @IsInt({ message: 'La audiencia debe ser un identificador entero.' })
    @Min(1, { message: 'La audiencia debe ser mayor a cero.' })
    idAudiencia?: number | null;

    @ApiPropertyOptional({ type: CriteriosAudienciaDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => CriteriosAudienciaDto)
    criteriosAudiencia?: CriteriosAudienciaDto;

    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @ValidateIf((_, valor) => valor !== null)
    @IsISO8601({}, { message: 'La fecha de envío no es válida.' })
    programadoPara?: string | null;

    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @ValidateIf((_, valor) => valor !== null)
    @IsISO8601({}, { message: 'La vigencia no es válida.' })
    vigenteHasta?: string | null;
}

export class CrearComunicadoDto extends CamposComunicadoDto {
    @ApiProperty({ example: 1 })
    @IsInt({ message: 'El tipo de comunicado debe ser un identificador entero.' })
    @Min(1, { message: 'El tipo de comunicado debe ser mayor a cero.' })
    idTipo: number;
}

export class ActualizarComunicadoDto extends CamposComunicadoDto {
    @ApiPropertyOptional({ example: 1 })
    @IsOptional()
    @IsInt({ message: 'El tipo de comunicado debe ser un identificador entero.' })
    @Min(1, { message: 'El tipo de comunicado debe ser mayor a cero.' })
    idTipo?: number;
}

export class NuevaVersionDto {
    @ApiProperty({ description: 'true corrige la versión vigente. false publica la versión siguiente.' })
    @IsBoolean({ message: 'Indica si la corrección es menor.' })
    correccionMenor: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString({ message: 'El título debe ser texto.' })
    @MaxLength(LIMITE_TITULO, { message: `El título no puede pasar de ${LIMITE_TITULO} caracteres.` })
    titulo?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString({ message: 'El resumen debe ser texto.' })
    @MaxLength(LIMITE_RESUMEN, { message: `El resumen no puede pasar de ${LIMITE_RESUMEN} caracteres.` })
    resumen?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString({ message: 'El cuerpo debe ser texto.' })
    @MaxLength(LIMITE_CUERPO, { message: `El cuerpo no puede pasar de ${LIMITE_CUERPO} caracteres.` })
    cuerpoHtml?: string;
}
