import { ApiProperty } from "@nestjs/swagger";
import { IsISO8601, IsNumber, IsString } from "class-validator";

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