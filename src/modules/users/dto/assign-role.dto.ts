import { IsInt, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignRoleDto {
  @ApiProperty({ example: 2, description: 'ID del rol a asignar (CatRoles)' })
  @IsInt()
  @IsNotEmpty()
  idRol: number;
}
