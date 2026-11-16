import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class NotifyStaffReductionDocumentDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    employeeId: number;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    templateId: number;
}