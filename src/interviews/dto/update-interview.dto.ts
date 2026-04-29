import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

class CriterionResultsDto {
    @ApiProperty()
    @IsNumber()
    @IsOptional()
    criterionId?: number;

    @ApiProperty()
    @IsNumber()
    @IsOptional()
    score?: number;

    @ApiProperty()
    @IsString()
    @IsOptional()
    comments?: string;
}

export class UpdateMeetingDto {
    @ApiProperty()
    @IsNumber()
    @IsOptional()
    statusId?: number;

    @ApiProperty()
    @IsString()
    @IsOptional()
    generalReport?: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    strengths?: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    improvementAreas?: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    recomendations?: string;

    @ApiProperty({
        type: [CriterionResultsDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CriterionResultsDto)
    @IsOptional()
    criteria?: CriterionResultsDto[];
}