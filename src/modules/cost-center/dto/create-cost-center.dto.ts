import { IsNotEmpty, IsString, IsNumber, Min, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCostCenterDto {
    @IsNotEmpty({ message: 'El código del centro de costos es obligatorio.' })
    @IsString({ message: 'El código debe ser una cadena de texto.' })
    @MaxLength(50, { message: 'El código no puede exceder los 50 caracteres.' })
    @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
    readonly Codigo: string;

    @IsNotEmpty({ message: 'La descripción es obligatoria.' })
    @IsString({ message: 'La descripción debe ser una cadena de texto.' })
    @MaxLength(200, { message: 'La descripción no puede exceder los 200 caracteres.' })
    @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
    readonly Descripcion: string;

    @IsNotEmpty({ message: 'El presupuesto anual es obligatorio.' })
    @IsNumber({}, { message: 'El presupuesto anual debe ser un número válido.' })
    @Min(0, { message: 'El presupuesto anual no puede ser menor a 0.' })
    readonly PresupuestoAnual: number;
}