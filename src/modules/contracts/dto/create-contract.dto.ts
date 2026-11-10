import { IsInt, IsOptional, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContractDto {
    @ApiPropertyOptional({ description: 'Template ID used to generate the contract' })
    @IsOptional()
    @IsInt()
    idTemplate?: number;

    @ApiPropertyOptional({ description: 'Generated document ID to link to this contract' })
    @IsOptional()
    @IsInt()
    idDocumentoGenerado?: number;

    @ApiPropertyOptional({ description: 'Contract start date' })
    @IsOptional()
    @IsDateString()
    fechaInicioContrato?: string;

    @ApiPropertyOptional({ description: 'Contract end date' })
    @IsOptional()
    @IsDateString()
    fechaTerminoContrato?: string;
}
