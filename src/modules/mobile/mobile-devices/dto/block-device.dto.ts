import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class BlockDeviceDto {
    @ApiProperty({
        description: 'Motivo del bloqueo del dispositivo',
        example: 'Dispositivo reportado como extraviado',
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(3)
    @MaxLength(500)
    motivo: string;
}
