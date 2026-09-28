import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    ValidateNested,
} from 'class-validator';
import { MobileCheckDto } from './mobile-check.dto';

export class SyncAttendanceDto {
    @ApiProperty({
        type: [MobileCheckDto],
        description:
            'Lote de checadas capturadas offline. Máximo 50. Se ordenan por fechaHoraRegistro antes de procesar.',
        minItems: 1,
        maxItems: 50,
    })
    @IsArray()
    @ArrayMinSize(1, { message: 'El lote debe incluir al menos un registro.' })
    @ArrayMaxSize(50, { message: 'El lote admite como máximo 50 registros.' })
    @ValidateNested({ each: true })
    @Type(() => MobileCheckDto)
    items: MobileCheckDto[];
}
