import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsNotEmpty, IsNumber, Min, Max, IsBoolean } from "class-validator";
import { Transform } from "class-transformer";

export class UpdateSalaryLevelsCatalogDto {
    @ApiProperty({
        description: 'Nivel salarial',
        example: 'Junior',
    })
    @IsString()
    @IsNotEmpty()
    @Transform(({ value }) => value?.trim() || value)
    readonly NombreNivel: string;

    @ApiProperty({
        description: 'Descripción del nivel salarial',
        example: 'Nivel salarial junior',
    })
    @IsString()
    @IsNotEmpty()
    @Transform(({ value }) => value?.trim() || value)
    readonly Descripcion: string;

    @ApiProperty({
        description: 'Salario mínimo',
        example: '1000',
    })
    @Transform(({ value }) => Number(value))
    @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'El salario mínimo debe ser un número' })
    @Min(0, { message: 'El salario mínimo no puede ser negativo' })
    readonly SalarioMinimo: number;

    @ApiProperty({
        description: 'Salario máximo',
        example: '2000',
    })
    @Transform(({ value }) => Number(value))
    @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'El salario máximo debe ser un número' })
    @Min(0, { message: 'El salario máximo no puede ser negativo' })
    readonly SalarioMaximo: number;

    @ApiProperty({
        description: 'Activo',
        example: '1',
    })
    @Transform(({ value }) => String(value) === '1' || value === true || value === 1)
    @IsBoolean()
    readonly Activo: boolean;
}