import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateInternalMovementDto {
  @ApiProperty({ description: 'Tipo de movimiento (Promoción, Cambio de Área, Ajuste Salarial, Reubicación)' })
  @IsString()
  tipoMovimiento: string;

  @ApiProperty({ description: 'Fecha efectiva del movimiento' })
  @IsDateString()
  fechaEfectiva: string;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  idPuestoNuevo?: number;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  idJefeNuevo?: number;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  idEmpresaNueva?: number;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  idSiteNuevo?: number;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  salarioBrutoNuevo?: number;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  salarioNetoNuevo?: number;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  idTipoMoneda?: number;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  idPeriodicidadPago?: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  motivo?: string;
}
