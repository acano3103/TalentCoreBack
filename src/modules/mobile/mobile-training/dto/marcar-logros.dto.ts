import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class MarcarLogrosVistosDto {
    @ApiProperty({ type: [String], example: ['PRIMER_CURSO'] })
    @IsArray({ message: 'Los códigos deben ir en una lista.' })
    @ArrayMaxSize(20, { message: 'No se pueden marcar más de 20 insignias a la vez.' })
    @IsString({ each: true, message: 'Cada código debe ser texto.' })
    codigos: string[];
}
