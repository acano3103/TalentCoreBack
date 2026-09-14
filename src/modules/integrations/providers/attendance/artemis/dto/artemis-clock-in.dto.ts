import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class ArtemisClockInDto {
    @ApiProperty({ example: 104592, description: 'ID único de la asistencia en Artemis' })
    @IsNotEmpty()
    @IsNumber()
    IdAsistencia: number;

    @ApiPropertyOptional({ example: 'usr_artemis_981', description: 'PublicId en Artemis' })
    @IsOptional()
    @IsString()
    PublicId?: string;

    @ApiProperty({ example: '10452', description: 'Número de empleado corporativo' })
    @IsNotEmpty()
    @IsString()
    ExternalUserId: string;

    @ApiProperty({ example: '2026-09-13T09:05:00Z', description: 'Fecha y hora exacta de la checada' })
    @IsNotEmpty()
    @IsDateString()
    FechaChecada: string;

    @ApiProperty({ example: 'IVR', description: 'Fuente de marcaje: IVR, BIOMETRICO, NFC' })
    @IsNotEmpty()
    @IsString()
    FuenteAsistencia: string;

    @ApiPropertyOptional({ example: 'Operaciones', description: 'Área reportada' })
    @IsOptional()
    @IsString()
    Area?: string;

    @ApiPropertyOptional({ example: 12, description: 'ID físico del dispositivo' })
    @IsOptional()
    @IsNumber()
    IdDispositivo?: number;

    @ApiPropertyOptional({ example: 'Checador Principal Entrada', description: 'Nombre o descripción del dispositivo' })
    @IsOptional()
    @IsString()
    Dispositivo?: string;

    @ApiPropertyOptional({ example: 'https://artemis-storage.s3.../photo.jpg', description: 'URL de fotografía si aplica' })
    @IsOptional()
    @IsString()
    UrlFoto?: string;
}