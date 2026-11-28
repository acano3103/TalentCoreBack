import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Length,
    ValidateNested,
} from 'class-validator';
import { KioskPoliciesDto } from './create-kiosk.dto';

export class UpdateKioskDto {
    @ApiPropertyOptional({ example: 'Recepción norte', minLength: 3, maxLength: 100 })
    @IsOptional()
    @IsString()
    @Length(3, 100)
    nombre?: string;

    @ApiPropertyOptional({
        enum: ['FIJO', 'CUADRILLA'],
        description: 'Cambiar la modalidad no está permitido.',
    })
    @IsOptional()
    @IsIn(['FIJO', 'CUADRILLA'])
    modalidad?: 'FIJO' | 'CUADRILLA';

    @ApiPropertyOptional({ example: 42, description: 'Empleado responsable del kiosco.' })
    @IsOptional()
    @IsInt()
    idEmpleadoResponsable?: number;

    @ApiPropertyOptional({
        type: [Number],
        example: [2, 5],
        description: 'Reemplaza las ubicaciones. Solo aplica a un kiosco fijo.',
    })
    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    idSites?: number[];

    @ApiPropertyOptional({ type: KioskPoliciesDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => KioskPoliciesDto)
    politicas?: KioskPoliciesDto;
}
