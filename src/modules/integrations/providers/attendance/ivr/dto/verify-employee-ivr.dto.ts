import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyEmployeeIvrDto {
    @ApiProperty({
        description: 'Número de empleado o matrícula marcado en el teclado telefónico',
        example: '1024',
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^[0-9]+$/, { message: 'El número de empleado solo debe contener dígitos numéricos' })
    employeeNumber: string;
}