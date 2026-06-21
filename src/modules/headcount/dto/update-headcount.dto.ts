import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsObject, Min } from 'class-validator';

export class UpdateHeadcountDto {
    @ApiProperty({ example: 1, description: 'ID de la relación área-ubicación' })
    @IsInt()
    @IsNotEmpty()
    idAreaUbicacion: number;

    @ApiProperty({ example: 3, description: 'ID del Site / Ubicación' })
    @IsInt()
    @IsNotEmpty()
    idSite: number;

    @ApiProperty({
        example: { '10': 5, '11': 2 },
        description: 'Mapa asociativo de [idPuesto]: cantidadDePlazasAutorizadas'
    })
    @IsObject()
    @IsNotEmpty()
    plazas: Record<number, number>;
}