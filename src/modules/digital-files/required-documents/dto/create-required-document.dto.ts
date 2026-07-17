import { IsBoolean, IsNotEmpty, IsString } from "class-validator";

export class CreateRequiredDocumentDto {

    @IsString()
    @IsNotEmpty()
    descripcion: string;

    @IsBoolean()
    @IsNotEmpty()
    esRequeridoBase: boolean;
}