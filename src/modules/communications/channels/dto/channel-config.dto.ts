import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class ActualizarChannelConfigDto {
    @ApiPropertyOptional({ example: 'IMPORTANTE_CRITICA' })
    @IsOptional()
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
    @IsString({ message: 'La política de WhatsApp debe ser texto.' })
    @MaxLength(30, { message: 'La política de WhatsApp no puede pasar de 30 caracteres.' })
    @Matches(/^[A-Z0-9_]+$/, { message: 'La política de WhatsApp solo admite letras, números y guion bajo.' })
    politicaWhatsApp?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt({ message: 'Los minutos deben ser un entero.' })
    @Min(0, { message: 'Los minutos no pueden ser negativos.' })
    @Max(10080, { message: 'Los minutos no pueden pasar de una semana.' })
    escalaImportanteMin?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt({ message: 'Los minutos deben ser un entero.' })
    @Min(0, { message: 'Los minutos no pueden ser negativos.' })
    @Max(10080, { message: 'Los minutos no pueden pasar de una semana.' })
    escalaCriticaMin?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt({ message: 'Los minutos deben ser un entero.' })
    @Min(0, { message: 'Los minutos no pueden ser negativos.' })
    @Max(10080, { message: 'Los minutos no pueden pasar de una semana.' })
    escalaCorreoMin?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean({ message: 'El silencio debe ser verdadero o falso.' })
    silencioActivo?: boolean;

    @ApiPropertyOptional({ example: '21:00' })
    @IsOptional()
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'La hora de silencio debe tener formato HH:mm.' })
    silencioInicio?: string;

    @ApiPropertyOptional({ example: '07:00' })
    @IsOptional()
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'La hora de silencio debe tener formato HH:mm.' })
    silencioFin?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt({ message: 'El límite diario debe ser un entero.' })
    @Min(1, { message: 'El límite diario debe ser al menos 1.' })
    @Max(50, { message: 'El límite diario no puede pasar de 50.' })
    limiteDiarioRecordatorios?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean({ message: 'El aviso de equipo debe ser verdadero o falso.' })
    jefesAvisoEquipo?: boolean;

    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @ValidateIf((_, valor) => valor !== null)
    @IsObject({ message: 'Las plantillas de WhatsApp deben ser un objeto.' })
    plantillasWhatsApp?: Record<string, unknown> | null;
}
