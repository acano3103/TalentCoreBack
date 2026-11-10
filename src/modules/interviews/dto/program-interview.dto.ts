import { ApiProperty } from "@nestjs/swagger";
import { IsISO8601, IsNumber, IsOptional, IsString } from "class-validator";

export class ProgramInterviewDto {
    @ApiProperty()
    @IsNumber()
    postulantId: number;

    @ApiProperty()
    @IsString()
    @IsOptional()
    title?: string;

    @ApiProperty()
    @IsISO8601()
    scheduledAt: string;

    @ApiProperty()
    @IsNumber()
    @IsOptional()
    duration?: number;
}