import { ApiProperty } from '@nestjs/swagger';

export class LegalWorkDayYearConfigDto {
    @ApiProperty({ example: 1 })
    idConfiguracion: number;

    @ApiProperty({ example: 1 })
    idTenant: number;

    @ApiProperty({ example: 1 })
    idEmpresa: number;

    @ApiProperty({ example: 'MEX' })
    codigoPais: string;

    @ApiProperty({ example: 2026 })
    anio: number;

    @ApiProperty({ example: 48.0 })
    horasSemana: number;

    @ApiProperty({ example: 8.0 })
    horasDia: number;

    @ApiProperty({ example: 9.0 })
    extraSemanalMax: number;

    @ApiProperty({ example: 3.0 })
    extraDiarioMax: number;

    @ApiProperty({ example: 3 })
    diasConExtraMax: number;

    @ApiProperty({ example: 2.0 })
    factorDentro: number;

    @ApiProperty({ example: 3.0 })
    factorFuera: number;

    @ApiProperty({ example: 0.25 })
    primaDominical: number;

    @ApiProperty({ example: 1 })
    activo: number;
}

export class LegalWorkDayStatusResponseDto {
    @ApiProperty({ example: true, description: 'Indica si la reforma está activa para la empresa' })
    isEnabled: boolean;

    @ApiProperty({ type: [LegalWorkDayYearConfigDto], description: 'Configuración de umbrales por año' })
    config: LegalWorkDayYearConfigDto[];
}

export class ToggleLegalWorkDayResponseDto {
    @ApiProperty({ example: true })
    isEnabled: boolean;

    @ApiProperty({ example: 'Reforma activada con valores oficiales' })
    message: string;
}