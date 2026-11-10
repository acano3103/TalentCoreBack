import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsPositive, Min, IsOptional, MaxLength } from 'class-validator';

export class CreateRequisitionDto {
    @ApiProperty({
        description: 'ID del puesto a solicitar obtenido del catálogo recursivo bajo cargo',
        example: 41,
    })
    @IsNotEmpty()
    @IsNumber()
    @IsPositive()
    idPuesto: number;

    @ApiProperty({
        description: 'ID de la ubicación física o centro de trabajo autorizado',
        example: 1,
    })
    @IsNotEmpty()
    @IsNumber()
    @IsPositive()
    idSite: number;

    @ApiProperty({
        description: 'Motivo o justificación operativa para levantar la vacante',
        example: 'Crecimiento de equipo por nueva cuenta interna',
    })
    @IsNotEmpty()
    @IsString()
    @MaxLength(255)
    motivo: string;

    @ApiProperty({
        description: 'Cantidad de vacantes idénticas a cubrir con este mismo perfil',
        example: 1,
        default: 1,
    })
    @IsNotEmpty()
    @IsNumber()
    @IsPositive()
    @Min(1)
    numeroVacantes: number;

    @ApiProperty({
        description: 'Canal de publicación del catálogo autorizado (Interna, Externa o Mixta)',
        example: 2,
    })
    @IsNotEmpty()
    @IsNumber()
    @IsPositive()
    idTipoPublicacion: number;

    @ApiProperty({
        description: 'ID del empleado físico que fungirá como jefe directo. Es opcional si el puesto es la cabeza raíz del organigrama.',
        example: 135,
        required: false,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    @IsPositive()
    idJefeInmediato?: number | null;

    @ApiProperty({
        description: 'Presupuesto o salario mínimo propuesto contextual de forma definitiva para la plaza',
        example: 35000.00,
    })
    @IsNotEmpty()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    salarioMinimo: number;

    @ApiProperty({
        description: 'Presupuesto o salario máximo propuesto contextual de forma definitiva para la plaza',
        example: 45000.00,
    })
    @IsNotEmpty()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    salarioMaximo: number;

    @ApiProperty({
        description: 'Información extra, observaciones críticas, aclaraciones o notas de las tecnologías requeridas',
        example: 'Conocimientos fuertes en React, Node.js y bases de datos relacionales.',
    })
    @IsNotEmpty()
    @IsString()
    informacionExtra: string;
}