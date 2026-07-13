import { IsArray, IsString, IsBoolean, IsInt, IsNumber, IsOptional, MinLength, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CampoPlantillaDto {
    @IsOptional()
    @IsInt()
    id?: number;

    @IsString()
    @MinLength(1)
    @MaxLength(100)
    identificador: string;

    @IsString()
    @MinLength(1)
    @MaxLength(200)
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
