import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class ExternalIdentifierItemDto {
    @IsOptional()
    @Type(() => Number)
    idIdentificadorExterno?: number;

    @IsString()
    @MaxLength(100)
    sistemaOrigen: string;

    @IsString()
    @MaxLength(150)
    empresaOrigen: string;

    @IsString()
    @MaxLength(100)
    tipoIdentificador: string;

    @IsString()
    @MaxLength(100)
    identificador: string;
}

export class UpdateEmployeeExternalIdentifiersDto {
    @IsOptional() // Permite que no venga o venga vacío
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ExternalIdentifierItemDto)
    identificadores?: ExternalIdentifierItemDto[];
}