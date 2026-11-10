import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { ModuloOrigenEnum, AccionAprobacionEnum } from '../enums/approval-origin.enum';

export class ActionApprovalDto {
    @IsInt()
    idOrigen: number; // idSolicitud o idMovimiento

    @IsEnum(ModuloOrigenEnum)
    origenModulo: ModuloOrigenEnum;

    @IsEnum(AccionAprobacionEnum)
    accion: AccionAprobacionEnum; // 'APROBAR' o 'RECHAZAR'

    @IsOptional()
    @IsString()
    comentarios?: string;
}