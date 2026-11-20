import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MobileAuthModule } from 'src/modules/mobile/mobile-auth/mobile-auth.module';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { AudiencesModule } from '../audiences/audiences.module';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { ChannelsModule } from '../channels/channels.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { WhatsappUsageModule } from '../whatsapp-usage/whatsapp-usage.module';
import { CommsAckService } from './comms-ack.service';
import { MeCommsController } from './me-comms.controller';
import { MeCommsService } from './me-comms.service';
import { MobileCommsController } from './mobile-comms.controller';
import { crearSnoozeStore, SnoozeStore } from './snooze.store';
import { TeamNoticeService } from './team-notice.service';

@Module({
    imports: [AnnouncementsModule, AudiencesModule, CapabilitiesModule, ChannelsModule, DeliveryModule, WhatsappUsageModule, MobileAuthModule],
    controllers: [MeCommsController, MobileCommsController],
    providers: [
        MeCommsService,
        TeamNoticeService,
        CommsAckService,
        {
            provide: SnoozeStore,
            useFactory: (config: ConfigService) => crearSnoozeStore(config.get<string>('REDIS_URL')),
            inject: [ConfigService],
        },
    ],
    exports: [CommsAckService],
})
export class MeModule {}
