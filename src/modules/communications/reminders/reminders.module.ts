import { Module } from '@nestjs/common';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { ChannelsModule } from '../channels/channels.module';
import { ReminderEngineService } from './reminder-engine.service';
import { ReminderRulesController } from './reminder-rules.controller';
import { ReminderRulesService } from './reminder-rules.service';

@Module({
    imports: [CapabilitiesModule, ChannelsModule],
    controllers: [ReminderRulesController],
    providers: [ReminderRulesService, ReminderEngineService],
})
export class RemindersModule {}
