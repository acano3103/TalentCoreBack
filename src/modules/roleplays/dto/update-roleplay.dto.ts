import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { CreateCriterionDto } from './create-criterion.dto';
import { CreateRoleplayDto } from './create-roleplay.dto';

export class UpdateRoleplayDto extends PartialType(
  OmitType(CreateRoleplayDto, ['Criterios'] as const),
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  Activo?: boolean;

  @ApiPropertyOptional({ type: [CreateCriterionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCriterionDto)
  Criterios?: CreateCriterionDto[];
}