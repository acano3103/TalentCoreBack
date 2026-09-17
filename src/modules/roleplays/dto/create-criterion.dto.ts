import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateCriterionDto {
  @ApiProperty({ example: 'Empatía' })
  @IsString()
  @IsNotEmpty()
  Nombre!: string;

  @ApiProperty({ example: 'Demuestra comprensión hacia las necesidades del cliente' })
  @IsString()
  @IsNotEmpty()
  Descripcion!: string;

  @ApiProperty({ example: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  PuntosMaximos!: number;

  @ApiProperty({ example: 0, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  Orden!: number;

  @ApiProperty({ enum: ['ESCALA', 'BINARIO'], example: 'ESCALA' })
  @IsIn(['ESCALA', 'BINARIO'])
  Tipo!: string;
}