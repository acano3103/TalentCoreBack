import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class RegisterAttendanceDto {
    @IsString()
    @IsNotEmpty()
    classId: string;

    @IsNumber()
    @IsNotEmpty()
    idEmpleado: number;
}