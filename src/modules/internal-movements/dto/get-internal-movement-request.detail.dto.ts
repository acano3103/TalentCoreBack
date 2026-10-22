
import { IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum InternalMovementRequestOriginEnum {
    MOVIMIENTO_INTERNO = 'MOVIMIENTO_INTERNO',
}

export class GetInternalMovementRequestDetailDto {
    @IsEnum(InternalMovementRequestOriginEnum)
    origenModulo: InternalMovementRequestOriginEnum;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    idOrigen: number;
}