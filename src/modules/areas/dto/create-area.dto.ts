import { IsNotEmpty, IsString, IsNumber, IsOptional, IsEmail, Min, MaxLength, IsArray, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class AreaAsignacionDto {
    @IsOptional()
    @IsNumber({}, { message: 'El idRelAreaUbicacion debe ser un número válido.' })
    idRelAreaUbicacion: number;

    @IsNotEmpty({ message: 'La ubicación (Site) es obligatoria.' })
    @IsNumber({}, { message: 'El idSite debe ser un número válido.' })
    readonly idSite: number;

    @IsOptional()
    @IsNumber({}, { message: 'El idCentroCostos debe ser un número válido.' })
    readonly idCentroCostos: number | null;

    @IsOptional()
    @IsNumber({}, { message: 'El presupuesto asignado debe ser un número válido.' })
    @Min(0, { message: 'El presupuesto asignado no puede ser menor a 0.' })
    readonly presupuestoAsignado: number;

    @IsOptional()
    @IsString({ message: 'El encargado debe ser una cadena de texto.' })
    @MaxLength(100, { message: 'El nombre del encargado no puede exceder los 100 caracteres.' })
    readonly encargado?: string | null;

    @IsOptional()
    @IsEmail({}, { message: 'El correo electrónico institucional no es válido.' })
    @MaxLength(100, { message: 'El correo no puede exceder los 100 caracteres.' })
    readonly correo?: string | null;

    @IsOptional()
    @IsString({ message: 'El teléfono debe ser una cadena de texto.' })
    @MaxLength(20, { message: 'El teléfono no puede exceder los 20 caracteres.' })
    readonly telefono?: string | null;

    @IsOptional()
    @IsString({ message: 'La extensión debe ser una cadena de texto.' })
    @MaxLength(10, { message: 'La extensión no puede exceder los 10 caracteres.' })
    readonly extension?: string | null;
}

export class CreateAreaDto {
    @IsNotEmpty({ message: 'El nombre del área es obligatorio.' })
    @IsString({ message: 'El nombre debe ser una cadena de texto.' })
    @MaxLength(150, { message: 'El nombre del área no puede exceder los 150 caracteres.' })
    @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
    readonly descripcion: string;

    @IsNotEmpty({ message: 'Las asignaciones de sedes son obligatorias.' })
    @IsArray({ message: 'Las asignaciones deben enviarse en formato de lista (Arreglo).' })
    @ValidateNested({ each: true })
    @Type(() => AreaAsignacionDto)
    readonly asignaciones: AreaAsignacionDto[];
}