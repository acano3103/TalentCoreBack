import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';

export class CreatePostulationDto {
  @ApiProperty({ example: '10' })
  @IsNotEmpty()
  vacante_id: string;

  @ApiProperty({ example: 'JUAN' })
  @IsNotEmpty()
  @IsString()
  nombre: string;

  @ApiProperty({ example: 'PÉREZ' })
  @IsNotEmpty()
  @IsString()
  primerApellido: string;

  @ApiProperty({ example: 'GARCÍA', required: false })
  @IsOptional()
  @IsString()
  segundoApellido?: string;

  @ApiProperty({ example: 'ejemplo@correo.com' })
  @IsEmail()
  @IsNotEmpty()
  correo: string;

  @ApiProperty({ example: '5512345678' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  telefono: string;

  @ApiProperty({ example: 'ABCD000000XXXXXX00' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(18)
  curp: string;
}