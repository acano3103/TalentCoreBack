import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class HistoryQueryDto {
    @ApiPropertyOptional({
        example: '2026-09-01',
        description: 'Inicio inclusive (YYYY-MM-DD). Si se omite, cubre los últimos 30 días.',
    })
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'from debe tener el formato YYYY-MM-DD',
    })
    from?: string;

    @ApiPropertyOptional({
        example: '2026-09-27',
        description: 'Fin inclusive (YYYY-MM-DD). Si se omite, usa la fecha local del sitio.',
    })
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'to debe tener el formato YYYY-MM-DD',
    })
    to?: string;
}
