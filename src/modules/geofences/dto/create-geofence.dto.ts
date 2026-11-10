import {
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
    IsArray,
    ArrayMinSize,
    ValidateIf
} from 'class-validator';
import { Type } from 'class-transformer';

export class PointDto {
    @IsNumber()
    @IsNotEmpty()
    lat: number;

    @IsNumber()
    @IsNotEmpty()
    lng: number;
}

export enum GeofenceType {
    CIRCLE = 'circle',
    POLYGON = 'polygon',
}

export class CreateGeofenceDto {
    @IsNumber()
    @IsNotEmpty()
    idSite: number;

    @IsNumber()
    @IsOptional()
    idEmpresa?: number;

    @IsString()
    @IsNotEmpty()
    nombre: string;

    @IsEnum(GeofenceType)
    @IsNotEmpty()
    tipo: GeofenceType;

    @IsNumber()
    @IsNotEmpty()
    latitud: number;

    @IsNumber()
    @IsNotEmpty()
    longitud: number;

    // Obligatorio si el tipo es circle
    @ValidateIf((o) => o.tipo === GeofenceType.CIRCLE)
    @IsNumber()
    @IsNotEmpty({ message: 'El radio es requerido para geocercas circulares' })
    radio?: number;

    // Obligatorio si el tipo es polygon (mínimo 3 puntos)
    @ValidateIf((o) => o.tipo === GeofenceType.POLYGON)
    @IsArray()
    @ArrayMinSize(3, { message: 'Un polígono debe tener al menos 3 vértices' })
    @ValidateNested({ each: true })
    @Type(() => PointDto)
    puntos?: PointDto[];
}