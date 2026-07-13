import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreatePlantillaDto {
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    nombre: string;

    @IsOptional()
    @IsString()
    descripcion?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    idModulo?: string;
}
