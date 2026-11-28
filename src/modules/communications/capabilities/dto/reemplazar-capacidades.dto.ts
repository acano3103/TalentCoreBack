import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { ALCANCES } from '../alcance';

export class CapacidadRolDto {
    @ApiProperty({ example: 'COM_CREAR' })
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
    @IsString({ message: 'El código de la capacidad debe ser texto.' })
    @MaxLength(40, { message: 'El código de la capacidad es demasiado largo.' })
    codigo: string;

    @ApiProperty({ enum: ALCANCES, example: 'TENANT' })
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
    @IsIn(ALCANCES, { message: 'El alcance no es válido.' })
    alcance: (typeof ALCANCES)[number];

    @ApiPropertyOptional({ type: [Number], description: 'Empresas o unidades. Vacío en el resto de alcances.' })
    @IsOptional()
    @IsArray({ message: 'Las referencias deben ser una lista.' })
    @ArrayMaxSize(200, { message: 'Hay demasiadas referencias.' })
    @IsInt({ each: true, message: 'Cada referencia debe ser un número entero.' })
    @Min(1, { each: true, message: 'Cada referencia debe ser mayor que cero.' })
    referencias?: number[];

    @ApiPropertyOptional({
        type: [String],
        description: 'Códigos de tipo de comunicado. Si se omite, el rol puede usar todos.',
    })
    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        Array.isArray(value)
            ? value.map((item) => (typeof item === 'string' ? item.trim().toUpperCase() : item))
            : value,
    )
    @IsArray({ message: 'Los tipos permitidos deben ser una lista.' })
    @ArrayMaxSize(30, { message: 'Hay demasiados tipos.' })
    @IsString({ each: true, message: 'Cada tipo debe ser texto.' })
    @MaxLength(40, { each: true, message: 'Hay un tipo con un código demasiado largo.' })
    tiposPermitidos?: string[];

    @ApiPropertyOptional({ description: 'Se guarda, pero la fase 1 no abre un flujo de aprobación.' })
    @IsOptional()
    @IsBoolean({ message: 'Requiere aprobación debe ser verdadero o falso.' })
    requiereAprobacion?: boolean;
}

export class ReemplazarCapacidadesDto {
    @ApiProperty({ type: [CapacidadRolDto] })
    @IsArray({ message: 'Las capacidades deben ser una lista.' })
    @ArrayMaxSize(30, { message: 'Hay demasiadas capacidades para un rol.' })
    @ValidateNested({ each: true })
    @Type(() => CapacidadRolDto)
    capacidades: CapacidadRolDto[];
}
