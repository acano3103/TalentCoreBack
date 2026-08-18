import { IsInt, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApprovalAssignmentDto {
  @ApiProperty({ example: 2, description: 'ID del rol de aprobación (CatRolAprobador)' })
  @IsInt()
  @IsNotEmpty()
  idRolAprobador: number;

  @ApiProperty({ example: 5, description: 'ID del usuario del sistema (auth_user)' })
  @IsInt()
  @IsNotEmpty()
  idUsuario: number;

  @ApiPropertyOptional({ example: 3, description: 'ID del área (CatAreas), opcional si el rol aplica por área' })
  @IsInt()
  @IsOptional()
  idArea?: number;
}
