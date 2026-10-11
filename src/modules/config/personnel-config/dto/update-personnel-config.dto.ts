import {
    IsArray,
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class VacacionesConfigDto {
    @ApiProperty({ example: 7 })
    @IsInt()
    @Min(0)
    diasAnticipacionMinima: number;

    @ApiProperty({ example: [7, 12], description: 'Meses del 1 al 12' })
    @IsArray()
    @IsInt({ each: true })
    @Min(1, { each: true })
    @Max(12, { each: true })
    mesesBloqueados: number[];

    @ApiProperty({ example: false })
    @IsBoolean()
    permitirSaldoNegativo: boolean;

    @ApiProperty({ example: 1 })
    @IsInt()
    @Min(1)
    diasMinimosPorSolicitud: number;
}

export class PermisosEIncapacidadesConfigDto {
    @ApiProperty({ example: 48 })
    @IsInt()
    @Min(1)
    horasLimiteSubirComprobante: number;

    @ApiProperty({ example: true })
    @IsBoolean()
    comprobanteObligatorio: boolean;

    @ApiProperty({ example: 3 })
    @IsInt()
    @Min(0)
    diasAnticipacionPermiso: number;
}

export class PermutasConfigDto {
    @ApiProperty({ example: true })
    @IsBoolean()
    permitirPermutas: boolean;

    @ApiProperty({ example: 2 })
    @IsInt()
    @Min(0)
    diasAnticipacionMinima: number;

    @ApiProperty({ example: 14 })
    @IsInt()
    @Min(1)
    diferenciaMaximaDias: number;
}

export class MovimientosInternosConfigDto {
    @ApiProperty({ example: 15 })
    @IsNumber()
    @Min(0)
    porcentajeMaximoAumentoSinDireccion: number;

    @ApiProperty({ example: 6 })
    @IsInt()
    @Min(0)
    mesesAntiguedadParaPromocion: number;

    @ApiProperty({ example: 15 })
    @IsInt()
    @Min(0)
    diasPreavisoBaja: number;
}

export class UpdatePersonnelConfigDto {
    @ApiProperty({ type: VacacionesConfigDto })
    @ValidateNested()
    @Type(() => VacacionesConfigDto)
    vacaciones: VacacionesConfigDto;

    @ApiProperty({ type: PermisosEIncapacidadesConfigDto })
    @ValidateNested()
    @Type(() => PermisosEIncapacidadesConfigDto)
    permisosEIncapacidades: PermisosEIncapacidadesConfigDto;

    @ApiProperty({ type: PermutasConfigDto })
    @ValidateNested()
    @Type(() => PermutasConfigDto)
    permutas: PermutasConfigDto;

    @ApiProperty({ type: MovimientosInternosConfigDto })
    @ValidateNested()
    @Type(() => MovimientosInternosConfigDto)
    movimientosInternos: MovimientosInternosConfigDto;
}