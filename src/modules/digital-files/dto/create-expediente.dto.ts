import { IsString, IsNotEmpty, IsOptional, IsInt, IsEmail, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class HorarioDto {
  @IsString()
  @IsNotEmpty()
  dia: string;

  @IsString()
  @IsNotEmpty()
  horaEntrada: string;

  @IsString()
  @IsNotEmpty()
  horaSalida: string;
}

export class CreateExpedienteDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  apellido1: string;

  @IsString()
  @IsOptional()
  apellido2?: string;

  @IsString()
  @IsNotEmpty()
  curp: string;

  @IsEmail()
  @IsNotEmpty()
  correo: string;

  @IsString()
  @IsNotEmpty()
  telefono: string;

  @Type(() => Number)
  @IsInt()
  idPuesto: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idCampania?: number;

  @Type(() => Number)
  @IsInt()
  idJefeInmediato: number;

  @Type(() => Number)
  @IsInt()
  idSite: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HorarioDto)
  schedules?: HorarioDto[];
}