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

export class KioskPoliciesDto {
    @IsDefined()
    @IsBoolean()
    requiereFoto: boolean;

    @IsDefined()
    @IsBoolean()
    deteccionRostro: boolean;

    @IsDefined()
    @IsBoolean()
    permitirOffline: boolean;

    @IsDefined()
    @IsBoolean()
    aceptarNoIdentificados: boolean;
}

export class CreateKioskDto {
    @IsString()
    @IsNotEmpty()
    @Length(3, 100)
    nombre: string;

    @IsIn(['FIJO', 'CUADRILLA'])
    modalidad: 'FIJO' | 'CUADRILLA';

    @IsInt()
    @IsNotEmpty()
    idEmpleadoResponsable: number;

    @ValidateIf((o) => o.modalidad === 'FIJO')
    @IsArray()
    @ArrayMinSize(1)
    @IsInt({ each: true })
    idSites: number[];

    @IsDefined()
    @ValidateNested()
    @Type(() => KioskPoliciesDto)
    politicas: KioskPoliciesDto;
}