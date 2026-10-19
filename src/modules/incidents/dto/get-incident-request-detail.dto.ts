
import { IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum IncidentRequestOriginEnum {
    INCIDENCIA = 'INCIDENCIA',
}

export class GetIncidentRequestDetailDto {
    @IsEnum(IncidentRequestOriginEnum)
    origenModulo: IncidentRequestOriginEnum;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    idOrigen: number;
}
