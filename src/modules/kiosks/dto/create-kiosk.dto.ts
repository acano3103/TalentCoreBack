import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsString,
    Length,
    ArrayMinSize,
    ValidateIf,
    ValidateNested,
    IsDefined,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class KioskPoliciesDto {
    @ApiProperty({ example: true, description: 'Exige fotografía en cada checada.' })
    @IsDefined()
    @IsBoolean()
    requiereFoto: boolean;

    @ApiProperty({ example: false, description: 'Exige rostro detectado. Solo es válido si requiereFoto está activo.' })
    @IsDefined()
    @IsBoolean()
    deteccionRostro: boolean;

    @ApiProperty({ example: true, description: 'Permite encolar checadas sin red.' })
    @IsDefined()
    @IsBoolean()
    permitirOffline: boolean;

    @ApiProperty({ example: true, description: 'Acepta incidencias de empleados no identificados.' })
    @IsDefined()
    @IsBoolean()
    aceptarNoIdentificados: boolean;
}

export class CreateKioskDto {
    @ApiProperty({ example: 'Recepción norte', minLength: 3, maxLength: 100 })
    @IsString()
    @IsNotEmpty()
    @Length(3, 100)
    nombre: string;

    @ApiProperty({ enum: ['FIJO', 'CUADRILLA'], example: 'FIJO' })
    @IsIn(['FIJO', 'CUADRILLA'])
    modalidad: 'FIJO' | 'CUADRILLA';

    @ApiProperty({ example: 42, description: 'Empleado responsable del kiosco.' })
    @IsInt()
    @IsNotEmpty()
    idEmpleadoResponsable: number;

    @ApiProperty({
        type: [Number],
        example: [2, 5],
        description: 'Ubicaciones del kiosco fijo. Una cuadrilla no lleva ubicaciones.',
    })
    @ValidateIf((o) => o.modalidad === 'FIJO')
    @IsArray()
    @ArrayMinSize(1)
    @IsInt({ each: true })
    idSites: number[];

    @ApiProperty({ type: KioskPoliciesDto })
    @IsDefined()
    @ValidateNested()
    @Type(() => KioskPoliciesDto)
    politicas: KioskPoliciesDto;
}