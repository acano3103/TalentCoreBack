import { IsString, IsEnum, IsNumber, IsArray, ValidateNested, IsOptional, IsISO8601 } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Entrevistas_interview_type, Entrevistas_modality } from 'generated/prisma/enums';

class CriterionDto {
    @ApiProperty()
    @IsString()
    name: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty()
    @IsNumber()
    maxScore: number;

    @ApiProperty()
    @IsNumber()
    @IsOptional()
    weight?: number;

    @ApiProperty()
    @IsNumber()
    @IsOptional()
    order?: number;
}

export class CreateInterviewDto {
    @ApiProperty()
    @IsNumber()
    providerId: number;

    @ApiProperty()
    @IsString()
    @IsOptional()
    agentId?: string;

    @ApiProperty()
    @IsEnum(Entrevistas_interview_type)
    interviewType: Entrevistas_interview_type;

    @ApiProperty()
    @IsEnum(Entrevistas_modality)
    modality: Entrevistas_modality;

    @ApiProperty()
    @IsString()
    title: string;

    @ApiProperty()
    @IsNumber()
    duration: number;

    @ApiProperty()
    @IsString()
    interviewerName: string;

    @ApiProperty()
    @IsOptional()
    @IsString()
    locationAddress?: string;

    @ApiProperty()
    @IsOptional()
    @IsString()
    comment?: string;

    @ApiProperty({
        type: [CriterionDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CriterionDto)
    criteria: CriterionDto[];
}

export class ProgramInterviewDto {
    @ApiProperty()
    @IsNumber()
    interviewId: number;

    @ApiProperty()
    @IsString()
    title: string;

    @ApiProperty()
    @IsISO8601()
    scheduledAt: string;

    @ApiProperty()
    @IsNumber()
    duration: number;
}