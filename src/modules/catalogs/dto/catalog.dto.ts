import { IsNumber, IsOptional, IsString } from "class-validator";
import { Transform } from "class-transformer";

export class CatalogDto {
    @IsNumber({}, { message: 'El id de la empresa debe ser un número válido.' })
    @IsOptional()
    @Transform(({ value }) => typeof value === 'number' ? value : Number(value))
    companyId?: number;
}
