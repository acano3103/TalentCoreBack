import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateCriterionDto } from './create-criterion.dto';

export class CreateRoleplayDto {
  @ApiProperty({ example: 'Renovación de póliza de seguro' })
  @IsString()
  @IsNotEmpty()
  Titulo!: string;

  @ApiPropertyOptional({ example: 'Simulación de llamada con cliente indeciso' })
  @IsOptional()
  @IsString()
  Descripcion?: string;

  @ApiProperty({
    example: 'El cliente llama porque su póliza vence en 30 días.',
    description: 'Prompt de escenario para la IA',
  })
  @IsString()
  @IsNotEmpty()
  Contexto!: string;

  @ApiProperty({ example: 'Lograr que el cliente renueve su póliza' })
  @IsString()
  @IsNotEmpty()
  Objetivo!: string;

  @ApiProperty({
    example: 'Actúa como un cliente ocupado pero educado.',
    description: 'Instrucción base del personaje IA',
  })
  @IsString()
  @IsNotEmpty()
  AiScript!: string;

  @ApiPropertyOptional({ example: 'Practicar manejo de objeciones de precio' })
  @IsOptional()
  @IsString()
  ObjetivosAprendizaje?: string;

  @ApiPropertyOptional({ default: 15, minimum: 5, maximum: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(60)
  DuracionMinutos?: number;

  @ApiProperty({ type: [CreateCriterionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCriterionDto)
  Criterios!: CreateCriterionDto[];
}