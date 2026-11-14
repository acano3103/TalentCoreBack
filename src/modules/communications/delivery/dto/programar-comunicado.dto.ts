import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

export class ProgramarComunicadoDto {
    @ApiProperty({ example: '2026-11-20T15:00:00.000Z' })
    @IsISO8601({}, { message: 'La fecha de envío no es válida.' })
    programadoPara: string;
}
