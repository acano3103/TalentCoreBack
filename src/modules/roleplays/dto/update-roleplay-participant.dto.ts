import { PickType } from '@nestjs/swagger';
import { AssignRoleplayParticipantsDto } from './assign-roleplay-participants.dto';

// null limpia el límite; si no se envía, no cambia
export class UpdateRoleplayParticipantDto extends PickType(AssignRoleplayParticipantsDto, ['FechaLimite', 'IntentosMaximos'] as const) { }
