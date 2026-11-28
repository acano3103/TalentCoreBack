import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const FILTROS_CURSO = ['todos', 'pendientes', 'en_progreso', 'por_vencer', 'completados', 'no_realizados'] as const;

export type FiltroCursos = (typeof FILTROS_CURSO)[number];

export class FiltroCursosQuery {
    @ApiPropertyOptional({
        enum: FILTROS_CURSO,
        default: 'todos',
        description:
            'pendientes = sin completar y a tiempo; en_progreso = pendiente con avance; por_vencer = vence en 7 días o menos y está disponible; no_realizados = vencido sin completar (un reprobado sigue como no aprobado).',
    })
    @IsOptional()
    @IsIn(FILTROS_CURSO, { message: 'El filtro no es válido.' })
    filtro?: FiltroCursos;
}
