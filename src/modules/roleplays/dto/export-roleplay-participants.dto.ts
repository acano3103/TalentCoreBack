import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const ESTATUS_PARTICIPANTE = ['pendiente', 'en_progreso', 'aprobado', 'vencido', 'sin_intentos'] as const;

export class ExportRoleplayParticipantsDto {
    @ApiPropertyOptional({ description: 'Nombre o número de empleado' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string;

    @ApiPropertyOptional({ enum: ESTATUS_PARTICIPANTE })
    @IsOptional()
    @IsIn(ESTATUS_PARTICIPANTE, { message: `El estatus debe ser: ${ESTATUS_PARTICIPANTE.join(', ')}` })
    estatus?: (typeof ESTATUS_PARTICIPANTE)[number];
}
