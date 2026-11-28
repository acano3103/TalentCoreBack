import { Module } from '@nestjs/common';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { ChannelsModule } from '../channels/channels.module';
import { WhatsappUsageModule } from '../whatsapp-usage/whatsapp-usage.module';
import { ReminderEngineService } from './reminder-engine.service';
import { ReminderRulesController } from './reminder-rules.controller';
import { ReminderRulesService } from './reminder-rules.service';

@Module({
    imports: [CapabilitiesModule, ChannelsModule, WhatsappUsageModule],
    controllers: [ReminderRulesController],
    providers: [ReminderRulesService, ReminderEngineService],
})
export class RemindersModule {}
