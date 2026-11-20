import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CriteriosAudienciaDto } from './criterios-audiencia.dto';

export class ActualizarAudienciaDto {
    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
    @IsString({ message: 'El nombre debe ser texto.' })
    @MaxLength(120, { message: 'El nombre no puede pasar de 120 caracteres.' })
    nombre?: string;

    @ApiPropertyOptional({ enum: ['DINAMICA', 'FIJA'] })
    @IsOptional()
    @IsIn(['DINAMICA', 'FIJA'], { message: 'El tipo debe ser DINAMICA o FIJA.' })
    tipo?: 'DINAMICA' | 'FIJA';

    @ApiPropertyOptional({ type: CriteriosAudienciaDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => CriteriosAudienciaDto)
    criterios?: CriteriosAudienciaDto;
}
