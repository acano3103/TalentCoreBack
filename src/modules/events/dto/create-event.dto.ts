import { IsNotEmpty, IsOptional, IsString, IsBoolean } from "class-validator";

export class CreateEventDto {
    @IsString({ message: 'El título debe ser una cadena de texto.' })
    @IsNotEmpty({ message: 'El título es obligatorio.' })
    title: string;

    @IsString({ message: 'La descripción debe ser una cadena de texto.' })
    @IsOptional()
    description?: string;

    @IsString({ message: 'La fecha de inicio debe ser una cadena de texto.' })
    @IsNotEmpty({ message: 'La fecha de inicio es obligatoria.' })
    start_datetime: string;

    @IsString({ message: 'La fecha de fin debe ser una cadena de texto.' })
    @IsNotEmpty({ message: 'La fecha de fin es obligatoria.' })
    end_datetime: string;

    @IsString({ message: 'El color debe ser una cadena de texto.' })
    @IsNotEmpty({ message: 'El color es obligatorio.' })
    color: string;

    @IsBoolean({ message: 'El campo is_all_day debe ser un valor booleano.' })
    @IsOptional()
    is_all_day?: boolean;
}