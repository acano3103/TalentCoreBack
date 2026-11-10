import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreateCourseDto {
    @ApiProperty({
        type: 'string',
        example: 'Course 1',
    })
    @IsNotEmpty({
        message: 'Course name is required',
    })
    @IsString()
    Descripcion: string;

    @ApiProperty({
        type: 'number',
        example: 1,
    })
    @IsNotEmpty({
        message: 'Area id is required',
    })
    @IsNumber()
    idArea: number;

    @ApiProperty({
        type: 'number',
        example: 1,
    })
    @IsNotEmpty({
        message: 'Type of course id is required',
    })
    @IsNumber()
    idTipoCurso: number;
}
