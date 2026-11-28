
import { IsEnum } from 'class-validator';

export enum RecruitmentDocumentAction {
    FIRMA = 'FIRMA',
    LECTURA = 'LECTURA',
}

export class NotifyRecruitmentDocumentDto {
    @IsEnum(RecruitmentDocumentAction, {
        message: 'La acción debe ser FIRMA o LECTURA',
    })
    action: RecruitmentDocumentAction;
}
