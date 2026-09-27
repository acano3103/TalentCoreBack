import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional } from 'class-validator';

export class AssignDeviceSiteDto {
    @ApiProperty({
        description: 'ID de la sede (CatSites) a asignar. Enviar null o undefined para desvincular.',
        example: 12,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    idSite?: number | null;
}