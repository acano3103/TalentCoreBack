import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ValidatePositionRequestDto {

    @ApiProperty({
        example: 'aprobar',
        enum: ['aprobar', 'rechazar'],
    })
    @IsIn(['aprobar', 'rechazar'])
    action: 'aprobar' | 'rechazar';

    @ApiPropertyOptional({
        example: 'No cumple con requisitos',
    })
    @IsOptional()
    @IsString()
    comment?: string;
}