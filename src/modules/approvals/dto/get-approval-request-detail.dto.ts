
import { IsIn, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetApprovalRequestDetailDto {
    @IsIn(['INCIDENCIA', 'MOVIMIENTO_INTERNO'])
    origenModulo: string;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    idOrigen: number;
}
