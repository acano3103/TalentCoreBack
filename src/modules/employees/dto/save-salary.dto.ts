import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class SaveSalaryDto {
    @ApiProperty({ type: 'number', example: 1 })
    @IsNotEmpty()
    @IsNumber()
    idEmpleado!: number;

    @ApiProperty({ type: 'number', example: 1 })
    @IsNotEmpty()
    @IsNumber()
    idTipoMoneda!: number;

    @ApiProperty({ type: 'number', example: 1 })
    @IsNotEmpty()
    @IsNumber()
    idPeriodicidadPago!: number;

    @ApiProperty({ type: 'number', example: 10000 })
    @IsNotEmpty()
    @IsNumber()
    salarioBruto!: number;

    @ApiProperty({ type: 'number', example: 10000 })
    @IsNotEmpty()
    @IsNumber()
    salarioNeto!: number;

    @ApiProperty({ type: 'number', example: 10000 })
    @IsNumber()
    @IsOptional()
    bono?: number;

    @ApiProperty({ type: 'string', example: '2022-01-01' })
    @IsNotEmpty()
    @IsString()
    fechaInicioVigencia!: string;
}