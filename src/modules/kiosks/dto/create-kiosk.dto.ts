import {
    IsArray,
    IsEnum,
    IsInt,
    IsNotEmpty,
    ArrayMinSize,
    ValidateIf,
} from "class-validator";

export class CreateKioskDto {
    @IsEnum(["FIJO", "CUADRILLA"])
    modalidad: "FIJO" | "CUADRILLA";

    @IsInt()
    @IsNotEmpty()
    idEmpleadoResponsable: number;

    @ValidateIf((o) => o.modalidad === "FIJO")
    @IsArray()
    @ArrayMinSize(1)
    @IsInt({ each: true })
    idSites: number[];
}