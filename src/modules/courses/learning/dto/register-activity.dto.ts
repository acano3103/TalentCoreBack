import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, Min, ValidateBy, ValidateIf, ValidationArguments } from 'class-validator';

// El player puede ir unos segundos por delante del final reportado por el navegador.
export const TOLERANCIA_SEGUNDOS_VIDEO = 5;

export class RegisterActivityDto {
    @ApiProperty({
        enum: ['latido', 'abrir_leccion', 'video_progreso'],
        description:
            'latido = el player sigue abierto y visible (cada 60 s); abrir_leccion = el empleado abrió una lección; video_progreso = segundos vistos del video. Al llegar al 90 % se marca el video como visto.',
    })
    @IsIn(['latido', 'abrir_leccion', 'video_progreso'], {
        message: 'El tipo de actividad debe ser latido, abrir_leccion o video_progreso',
    })
    tipo: 'latido' | 'abrir_leccion' | 'video_progreso';

    @ApiPropertyOptional({ example: 12, description: 'Requerido cuando tipo = abrir_leccion o video_progreso' })
    @ValidateIf((o) => o.tipo === 'abrir_leccion' || o.tipo === 'video_progreso')
    @Type(() => Number)
    @IsInt({ message: 'El idLeccion debe ser un número entero' })
    idLeccion?: number;

    @ApiPropertyOptional({
        example: 90,
        description: 'Segundos reproducidos. Requerido cuando tipo = video_progreso. Entero ≥ 0 y como máximo duracionSegundos + 5.',
    })
    @ValidateIf((o) => o.tipo === 'video_progreso')
    @Type(() => Number)
    @IsInt({ message: 'Los segundos vistos deben ser un entero mayor o igual a 0' })
    @Min(0, { message: 'Los segundos vistos deben ser un entero mayor o igual a 0' })
    @ValidateBy({
        name: 'segundosCabenEnDuracion',
        validator: {
            validate(value: unknown, args?: ValidationArguments) {
                const dto = args?.object as RegisterActivityDto;
                const duracion = dto.duracionSegundos;
                if (dto.tipo !== 'video_progreso') return true;
                if (typeof value !== 'number' || typeof duracion !== 'number') return true;
                if (!Number.isInteger(value) || !Number.isInteger(duracion)) return true;
                return value <= duracion + TOLERANCIA_SEGUNDOS_VIDEO;
            },
            defaultMessage: () => 'Los segundos vistos no pueden superar la duración del video.',
        },
    })
    segundosVistos?: number;

    @ApiPropertyOptional({
        example: 100,
        description: 'Duración del video en segundos. Requerida cuando tipo = video_progreso. Entero ≥ 0.',
    })
    @ValidateIf((o) => o.tipo === 'video_progreso')
    @Type(() => Number)
    @IsInt({ message: 'La duración debe ser un entero mayor o igual a 0' })
    @Min(0, { message: 'La duración debe ser un entero mayor o igual a 0' })
    duracionSegundos?: number;
}
