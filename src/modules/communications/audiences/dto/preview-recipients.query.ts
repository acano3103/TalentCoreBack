import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class PreviewRecipientsQueryDto {
    @ApiProperty()
    @IsUUID('4', { message: 'La vista previa no es válida.' })
    previewId: string;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @IsInt({ message: 'La página debe ser un entero.' })
    @Min(1, { message: 'La página empieza en 1.' })
    @Max(100000, { message: 'La página es demasiado alta.' })
    page?: number;

    @ApiPropertyOptional({ default: 20 })
    @IsOptional()
    @IsInt({ message: 'El tamaño de página debe ser un entero.' })
    @Min(1, { message: 'El tamaño de página debe ser al menos 1.' })
    @Max(100, { message: 'El tamaño de página no puede pasar de 100.' })
    pageSize?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString({ message: 'La búsqueda debe ser texto.' })
    @MaxLength(80, { message: 'La búsqueda no puede pasar de 80 caracteres.' })
    search?: string;
}
