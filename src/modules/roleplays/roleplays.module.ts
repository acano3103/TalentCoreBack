import { Module } from '@nestjs/common';
import { RoleplaysController } from './roleplays.controller';
import { RoleplaysService } from './roleplays.service';
import { RoleplayCallsController } from './roleplay-calls.controller';
import { RoleplayCallsService } from './roleplay-calls.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { RoleplayParticipantsController } from './roleplay-participants.controller';
import { RoleplayParticipantsService } from './roleplay-participants.service';
import { RoleplayAccessService } from './roleplay-access.service';
import { MyRoleplaysController } from './my-roleplays.controller';
import { MyRoleplaysService } from './my-roleplays.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [RoleplaysController, RoleplayCallsController, RoleplayParticipantsController, MyRoleplaysController],
  providers: [RoleplaysService, RoleplayCallsService, RoleplayParticipantsService, RoleplayAccessService, MyRoleplaysService],
  exports: [RoleplaysService, RoleplayCallsService],
})
export class RoleplaysModule {}
