import { IsNotEmpty, IsString } from "class-validator";

export class CreatePositionRequestDto {
    @IsString({ message: 'La descripción de la solicitud debe ser texto.' })
    @IsNotEmpty({ message: 'La descripción de la solicitud es obligatoria.' })
    description: string;
}