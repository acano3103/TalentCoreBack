import { Module } from '@nestjs/common';
import { RoleplaysController } from './roleplays.controller';
import { RoleplaysService } from './roleplays.service';
import { RoleplayCallsController } from './roleplay-calls.controller';
import { RoleplayCallsService } from './roleplay-calls.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { RoleplayParticipantsController } from './roleplay-participants.controller';
import { RoleplayParticipantsService } from './roleplay-participants.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [RoleplaysController, RoleplayCallsController, RoleplayParticipantsController],
  providers: [RoleplaysService, RoleplayCallsService, RoleplayParticipantsService],
  exports: [RoleplaysService, RoleplayCallsService],
})
export class RoleplaysModule {}
