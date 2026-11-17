import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { CANALES_PREFERENCIA, CATEGORIAS_PREFERENCIA } from '../preferencias-reglas';

export const TABS_CAMPANA = ['unread', 'all', 'done'] as const;
export const CATEGORIAS_LISTADO = ['COMUNICADO', 'AVISO', 'RECORDATORIO', 'APROBACION', 'SISTEMA'] as const;

export class ListarNotificacionesQuery {
    @ApiPropertyOptional({ enum: TABS_CAMPANA, default: 'unread' })
    @IsOptional()
    @IsIn(TABS_CAMPANA, { message: 'La pestaña debe ser unread, all o done.' })
    tab?: (typeof TABS_CAMPANA)[number];

    @ApiPropertyOptional({
        enum: CATEGORIAS_LISTADO,
        description: 'Filtro de la app y la web. category sigue aceptándose con el mismo valor.',
    })
    @IsOptional()
    @IsIn(CATEGORIAS_LISTADO, { message: 'La categoría debe ser COMUNICADO, AVISO, RECORDATORIO, APROBACION o SISTEMA.' })
    categoria?: (typeof CATEGORIAS_LISTADO)[number];

    @ApiPropertyOptional({ description: 'Alias anterior de categoria.' })
    @IsOptional()
    @IsString({ message: 'La categoría debe ser texto.' })
    @MaxLength(30, { message: 'La categoría no puede pasar de 30 caracteres.' })
    category?: string;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'La página debe ser un entero.' })
    @Min(1, { message: 'La página debe ser al menos 1.' })
    page?: number;
}

export class LeerTodasQuery {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString({ message: 'La categoría debe ser texto.' })
    @MaxLength(30, { message: 'La categoría no puede pasar de 30 caracteres.' })
    category?: string;
}

export class PreferenciaCanalDto {
    @ApiProperty({ enum: CATEGORIAS_PREFERENCIA })
    @IsIn(CATEGORIAS_PREFERENCIA, { message: 'Esa categoría de aviso no existe.' })
    categoria: (typeof CATEGORIAS_PREFERENCIA)[number];

    @ApiProperty({ enum: CANALES_PREFERENCIA })
    @IsIn(CANALES_PREFERENCIA, { message: 'El canal debe ser PUSH, CORREO o WHATSAPP.' })
    canal: (typeof CANALES_PREFERENCIA)[number];

    @ApiProperty()
    @IsBoolean({ message: 'Indica si el canal queda activo.' })
    activa: boolean;
}

export class GuardarPreferenciasDto {
    @ApiProperty({ type: [PreferenciaCanalDto] })
    @ArrayMinSize(1, { message: 'Incluye al menos una preferencia.' })
    @ArrayMaxSize(18, { message: 'La matriz no admite más de 18 preferencias.' })
    @ValidateNested({ each: true })
    @Type(() => PreferenciaCanalDto)
    preferencias: PreferenciaCanalDto[];
}

export class RegistrarPushTokenDto {
    @ApiProperty({ description: 'Token de Expo.' })
    @IsString({ message: 'El token debe ser texto.' })
    @MinLength(8, { message: 'El token es demasiado corto.' })
    @MaxLength(255, { message: 'El token no puede pasar de 255 caracteres.' })
    token: string;

    @ApiProperty({ enum: ['ios', 'android', 'web'] })
    @IsIn(['ios', 'android', 'web'], { message: 'La plataforma debe ser ios, android o web.' })
    plataforma: 'ios' | 'android' | 'web';

    @ApiPropertyOptional()
    @IsOptional()
    @IsString({ message: 'El dispositivo debe ser texto.' })
    @MaxLength(120, { message: 'El nombre del dispositivo no puede pasar de 120 caracteres.' })
    dispositivo?: string;
}
