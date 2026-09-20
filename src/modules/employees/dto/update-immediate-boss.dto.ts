import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateImmediateBossDto {
    @ApiProperty({
        description: 'ID del empleado que fungirá como nuevo jefe inmediato',
        example: 12,
    })
    @Type(() => Number)
    @IsInt()
    @IsPositive()
    immediateBossId: number;
}