import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateInterviewDto {
    @ApiProperty()
    @IsString()
    @IsOptional()
    title?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    interviewType?: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    modality?: string;

    @ApiProperty()
    @IsNumber()
    @IsOptional()
    duration?: number;

    @ApiProperty()
    @IsNumber()
    @IsOptional()
    interviewerId?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    locationAddress?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    comment?: string;

    @ApiProperty()
    @IsNumber()
    @IsOptional()
    vacancyId?: number;
}

export class RescheduleInterviewDto {
    @ApiProperty()
    @IsString()
    @IsOptional()
    scheduledAt: string;

    @ApiProperty()
    @IsNumber()
    @IsOptional()
    duration?: number;
}