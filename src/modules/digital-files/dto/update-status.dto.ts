import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateExpedienteStatusDto {
  @ApiProperty({ description: 'ID del nuevo estatus del expediente' })
  @IsInt()
  nuevoEstatus: number;

  @ApiProperty({ description: 'Comentario opcional sobre el cambio de estatus', required: false })
  @IsOptional()
  @IsString()
  comentario?: string;
}