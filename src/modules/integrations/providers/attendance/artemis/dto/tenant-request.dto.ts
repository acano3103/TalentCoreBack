import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { CatSites_TipoAsistencia } from 'generated/prisma/enums';

export class TenantRequestDto {
    @ApiProperty({
        description: 'Unique identifier of the tenant.',
        example: 1,
        minimum: 1,
    })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    tenantId: number;

    @ApiPropertyOptional({
        description:
            'Attendance method used to filter locations. Use ALL or omit this property to retrieve all locations.',
        enum: [...Object.values(CatSites_TipoAsistencia), 'ALL'],
        example: CatSites_TipoAsistencia.NFC,
        default: 'ALL',
    })
    @IsOptional()
    @IsEnum({
        ...CatSites_TipoAsistencia,
        ALL: 'ALL',
    })
    attendanceMethod?: CatSites_TipoAsistencia | 'ALL';
}