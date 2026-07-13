import { IsObject, IsOptional, IsInt } from 'class-validator';

export class GenerarDocumentoDto {
    @IsObject()
    valores: Record<string, string>;

    @IsOptional()
    @IsInt()
    idVacante?: number;

    @IsOptional()
    @IsInt()
    idCandidato?: number;
}
