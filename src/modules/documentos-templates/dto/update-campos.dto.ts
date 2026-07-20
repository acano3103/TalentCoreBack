import { IsArray, IsString, IsBoolean, IsInt, IsNumber, IsOptional, MinLength, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CampoPlantillaDto {
    @IsOptional()
    @IsInt()
    id?: number;

    @IsString({ message: "El identificador debe ser texto" })
    @MinLength(1, { message: "El identificador es obligatorio" })
    @MaxLength(100, { message: "El identificador no puede exceder 100 caracteres" })
    identificador: string;

    @IsString({ message: "El nombre del campo debe ser texto" })
    @MinLength(1, { message: "El nombre del campo es obligatorio" })
    @MaxLength(200, { message: "El nombre del campo no puede exceder 200 caracteres" })
    nombreCampo: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    tipoDato?: string;

    @IsOptional()
    @IsBoolean()
    requerido?: boolean;

    @IsOptional()
    @IsInt()
    orden?: number;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    valorDefault?: string;

    @IsOptional()
    @IsString()
    textoOriginal?: string;

    @IsOptional()
    @IsInt()
    pagina?: number;

    @IsOptional()
    @IsNumber()
    posicionX?: number;

    @IsOptional()
    @IsNumber()
    posicionY?: number;

    @IsOptional()
    @IsNumber()
    ancho?: number;

    @IsOptional()
    @IsNumber()
    alto?: number;
}

export class UpdateCamposDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CampoPlantillaDto)
    campos: CampoPlantillaDto[];
}
