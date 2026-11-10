import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional } from 'class-validator';

export class CommitScormDto {
    @ApiProperty({
        example: { 'cmi.core.lesson_status': 'incomplete', 'cmi.core.lesson_location': 'slide-4', 'cmi.suspend_data': '...' },
        description: 'Valores cmi.* que reportó el paquete SCORM (1.2 o 2004)',
    })
    @IsObject({ message: 'valores debe ser un objeto con los datos cmi del paquete' })
    valores: Record<string, string>;

    @ApiPropertyOptional({ example: false, description: 'true cuando el paquete llamó LMSFinish / Terminate (o el empleado cerró la ventana)' })
    @IsOptional()
    @IsBoolean()
    terminado?: boolean;
}
