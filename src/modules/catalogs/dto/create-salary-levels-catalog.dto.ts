import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNotEmpty, IsNumber, Min, IsBoolean } from "class-validator";
import { Transform } from "class-transformer";

export class CreateSalaryLevelsCatalogDto {
    @ApiProperty({
        description: 'Nombre descriptivo del nivel salarial',
        example: 'Nivel 4 - Especialistas Senior',
    })
    @IsString()
    @IsNotEmpty()
    @Transform(({ value }) => value?.trim() || value)
    readonly NombreNivel: string;

    @ApiProperty({
        description: 'Descripción operativa del nivel y su alcance estructural',
        example: 'Tabulador destinado a ingenieros senior y líderes técnicos.',
    })
    @IsString()
    @IsNotEmpty()
    @Transform(({ value }) => value?.trim() || value)
    readonly Descripcion: string;

    @ApiProperty({
        description: 'Límite de salario mínimo de la banda',
        example: 35000,
    })
    @Transform(({ value }) => Number(value))
    @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'El salario mínimo debe ser un número válido' })
    @Min(0, { message: 'El salario mínimo no puede ser un monto negativo' })
    readonly SalarioMinimo: number;

    @ApiProperty({
        description: 'Límite de salario máximo de la banda',
        example: 60000,
    })
    @Transform(({ value }) => Number(value))
    @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'El salario máximo debe ser un número válido' })
    @Min(0, { message: 'El salario máximo no puede ser un monto negativo' })
    readonly SalarioMaximo: number;

    @ApiProperty({
        description: 'Estado inicial del nivel salarial dentro del catálogo',
        example: 1,
    })
    @Transform(({ value }) => String(value) === '1' || value === true || value === 1)
    @IsBoolean()
    readonly Activo: boolean;
}