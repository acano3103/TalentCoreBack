import { IsString, IsEnum, IsNumber, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Entrevistas_interview_type, Entrevistas_modality } from 'generated/prisma/enums';

class QuestionDto {
    @ApiProperty()
    @IsString()
    question: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    expectedAnswer?: string;

    @ApiProperty()
    @IsNumber()
    @IsOptional()
    order?: number;
}

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

    @ApiProperty({ type: [QuestionDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => QuestionDto)
    @IsOptional()
    questions?: QuestionDto[];
}

export class CreateInterviewDto {
    @ApiProperty({ type: [Number] })
    @IsArray()
    @IsNumber({}, { each: true })
    positionIds: number[];

    @ApiProperty()
    @IsNumber()
    providerId: number;

    @ApiProperty()
    @IsNumber()
    areaId: number;

    @ApiProperty()
    @IsString()
    @IsOptional()
    agentId?: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    description?: string;

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