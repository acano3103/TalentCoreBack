import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateBajaDto {
  @ApiProperty({ description: 'Fecha efectiva de la baja' })
  @IsDateString()
  fechaBaja: string;

  @ApiProperty({ description: 'Causa o motivo de la baja' })
  @IsOptional()
  @IsString()
  causaBaja?: string;
}
