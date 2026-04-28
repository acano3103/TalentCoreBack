import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

class CriterionDto {
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
    //status

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
        type: [CriterionDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CriterionDto)
    @IsOptional()
    criteria?: CriterionDto[];
}