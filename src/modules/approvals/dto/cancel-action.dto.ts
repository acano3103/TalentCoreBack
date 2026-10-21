import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { ModuloOrigenEnum, AccionCancelacionEnum } from '../enums/approval-origin.enum';

export class CancelApprovalDto {
    @IsInt()
    idOrigen: number; // idSolicitud o idMovimiento

    @IsEnum(ModuloOrigenEnum)
    origenModulo: ModuloOrigenEnum;

    @IsEnum(AccionCancelacionEnum)
    accion: AccionCancelacionEnum; // 'CANCELAR'

    @IsOptional()
    @IsString()
    comentarios?: string;
}