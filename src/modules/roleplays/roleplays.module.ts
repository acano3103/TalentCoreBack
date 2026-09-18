import { Module } from '@nestjs/common';
import { RoleplaysController } from './roleplays.controller';
import { RoleplaysService } from './roleplays.service';
import { RoleplayCallsController } from './roleplay-calls.controller';
import { RoleplayCallsService } from './roleplay-calls.service';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [IntegrationsModule],
  controllers: [RoleplaysController, RoleplayCallsController],
  providers: [RoleplaysService, RoleplayCallsService],
  exports: [RoleplaysService, RoleplayCallsService],
})
export class RoleplaysModule {}