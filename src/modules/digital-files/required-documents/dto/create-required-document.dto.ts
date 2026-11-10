import { IsBoolean, IsNotEmpty, IsString, IsOptional, IsInt, Min } from "class-validator";

export class CreateRequiredDocumentDto {

    @IsString()
    @IsNotEmpty()
    descripcion: string;

    @IsBoolean()
    @IsNotEmpty()
    esRequeridoBase: boolean;

    @IsBoolean()
    @IsOptional()
    requiereVencimiento?: boolean;

    @IsInt()
    @Min(1)
    @IsOptional()
    diasVigenciaDefault?: number;

    @IsInt()
    @Min(1)
    @IsOptional()
    diasAlertaPrevio?: number;
}