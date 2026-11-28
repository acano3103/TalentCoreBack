import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RegistrarAsistenciaQrDto {
    @ApiProperty({
        description: 'Contenido completo del QR (URL de la página pública) o solo el classId cifrado.',
        example: 'https://app.talentcore.com/attendance/class/ab%3Acd',
    })
    @IsString()
    @IsNotEmpty({ message: 'El código del QR es obligatorio.' })
    codigo: string;
}
