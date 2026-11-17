import {
    IsInt,
    IsNumber,
    Max,
    Min,
} from 'class-validator';

export class SaveSignaturePositionDto {
    @IsInt()
    @Min(1)
    pagina: number;

    @IsNumber()
    @Min(0)
    @Max(100)
    x: number;

    @IsNumber()
    @Min(0)
    @Max(100)
    y: number;

    @IsNumber()
    @Min(0.01)
    @Max(100)
    ancho: number;

    @IsNumber()
    @Min(0.01)
    @Max(100)
    alto: number;
}