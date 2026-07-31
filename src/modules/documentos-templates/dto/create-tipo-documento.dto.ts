import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateTipoDocumentoDto {
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    nombre: string;
}
