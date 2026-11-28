import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateCourseSessionDto } from 'src/modules/courses/dto/create-course-session.dto';

export class GrupoPendienteDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idCurso: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idSite: number;
}

export class ProgramarPendientesDto {
  @ApiProperty({ type: [GrupoPendienteDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Indica al menos un grupo.' })
  @ValidateNested({ each: true })
  @Type(() => GrupoPendienteDto)
  grupos: GrupoPendienteDto[];

  @ApiProperty({ type: CreateCourseSessionDto })
  @ValidateNested()
  @Type(() => CreateCourseSessionDto)
  sesion: CreateCourseSessionDto;
}

export class RechazarLoteDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  motivo: string;
}

export class ProgramacionQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idSite?: number;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  orden?: 'asc' | 'desc';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
