import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class VistaEquipoQuery {
    @ApiPropertyOptional({
        enum: ['true', 'false'],
        description: 'Si es true, la vista previa cuenta WhatsApp para quien no tiene la app.',
    })
    @IsOptional()
    @IsIn(['true', 'false'], { message: 'whatsappSinApp debe ser true o false.' })
    whatsappSinApp?: 'true' | 'false';
}

export class CrearAvisoEquipoDto {
    @ApiProperty({ maxLength: 120 })
    @IsString({ message: 'El título debe ser texto.' })
    @MinLength(1, { message: 'Escribe el título.' })
    @MaxLength(120, { message: 'El título no puede pasar de 120 caracteres.' })
    titulo: string;

    @ApiProperty({ maxLength: 500, description: 'Texto plano. El API lo guarda como HTML escapado.' })
    @IsString({ message: 'El mensaje debe ser texto.' })
    @MinLength(1, { message: 'Escribe el mensaje.' })
    @MaxLength(500, { message: 'El mensaje no puede pasar de 500 caracteres.' })
    mensaje: string;

    @ApiProperty({ description: 'true pide acuse «leí y entendí». false no pide confirmación.' })
    @IsBoolean({ message: 'Indica si pides confirmación.' })
    pedirConfirmacion: boolean;

    @ApiProperty({ description: 'true manda WhatsApp a quien no tiene la app, si hay plantilla aprobada.' })
    @IsBoolean({ message: 'Indica si quien no tiene la app recibe WhatsApp.' })
    whatsappSinApp: boolean;
}
