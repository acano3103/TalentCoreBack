import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class ToggleLegalWorkDayDto {
    @ApiProperty({
        example: true,
        description: 'Activa (true) o desactiva (false) la aplicación de la reforma gradual de jornada legal para la empresa.',
    })
    @IsNotEmpty()
    @IsBoolean()
    enable: boolean;
}