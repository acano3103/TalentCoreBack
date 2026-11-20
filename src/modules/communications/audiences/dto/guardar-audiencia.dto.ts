import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CriteriosAudienciaDto } from './criterios-audiencia.dto';

export class GuardarAudienciaDto {
    @ApiProperty({ example: 'Operativos del norte' })
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
    @IsString({ message: 'El nombre debe ser texto.' })
    @IsNotEmpty({ message: 'El nombre es obligatorio.' })
    @MaxLength(120, { message: 'El nombre no puede pasar de 120 caracteres.' })
    nombre: string;

    @ApiProperty({ enum: ['DINAMICA', 'FIJA'] })
    @IsIn(['DINAMICA', 'FIJA'], { message: 'El tipo debe ser DINAMICA o FIJA.' })
    tipo: 'DINAMICA' | 'FIJA';

    @ApiProperty({ type: CriteriosAudienciaDto })
    @ValidateNested()
    @Type(() => CriteriosAudienciaDto)
    criterios: CriteriosAudienciaDto;
}
