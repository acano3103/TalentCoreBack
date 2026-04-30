import { IsInt, IsOptional } from 'class-validator';

export class UpdatePostulationStatusDto {
    @IsInt()
    status_id: number;

    @IsInt()
    @IsOptional()
    campaign_id?: number;
}