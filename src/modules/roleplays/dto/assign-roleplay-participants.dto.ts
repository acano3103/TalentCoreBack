import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class AssignRoleplayParticipantsDto {
  @ApiProperty({ example: [101, 102, 105] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe seleccionar al menos un empleado.' })
  @Type(() => Number)
  @IsInt({ each: true })
  empleadosIds!: number[];

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Fecha límite (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  FechaLimite?: string | null;

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  IntentosMaximos?: number | null;
}
