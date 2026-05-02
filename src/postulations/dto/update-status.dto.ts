import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class UpdatePostulationStatusDto {
    @ApiProperty({
        example: 1,
        description: 'The id of the status',
        type: 'number'
    })
    @Type(() => Number)
    @IsInt()
    statusId: number;

    @ApiProperty({
        example: 1,
        description: 'The campaign id (in case it is necessary)',
        type: 'number'
    })
    @IsInt()
    @IsOptional()
    campaignId?: number;
}