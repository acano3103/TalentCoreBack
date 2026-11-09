
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class LocationEmployeesRequestDto {
    @ApiProperty({
        description: 'Unique identifier of the tenant.',
        example: 1,
        minimum: 1,
    })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    tenantId: number;

    @ApiProperty({
        description: 'Unique identifier of the location.',
        example: 21,
        minimum: 1,
    })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    locationId: number;
}