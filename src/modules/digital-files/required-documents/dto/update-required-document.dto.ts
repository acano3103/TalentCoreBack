import { IsBoolean, IsNotEmpty, IsString } from "class-validator";


export class UpdateRequiredDocumentDto {
    @IsString()
    @IsNotEmpty()
    descripcion: string;

    @IsBoolean()
    @IsNotEmpty()
    esRequeridoBase: boolean;
}
