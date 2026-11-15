import { Module } from '@nestjs/common';
import { AnnouncementsModule } from './announcements/announcements.module';
import { AudiencesModule } from './audiences/audiences.module';
import { CapabilitiesModule } from './capabilities/capabilities.module';
import { ChannelsModule } from './channels/channels.module';
import { KioskCommsModule } from './kiosk-comms/kiosk-comms.module';
import { MeModule } from './me/me.module';
import { NotificationCenterModule } from './notification-center/notification-center.module';
import { PublicLinksModule } from './public-links/public-links.module';
import { RemindersModule } from './reminders/reminders.module';
import { StaffClassificationModule } from './staff-classification/staff-classification.module';
import { WhatsappUsageModule } from './whatsapp-usage/whatsapp-usage.module';

@Module({
    imports: [
        CapabilitiesModule,
        StaffClassificationModule,
        ChannelsModule,
        AudiencesModule,
        AnnouncementsModule,
        MeModule,
        NotificationCenterModule,
        PublicLinksModule,
        KioskCommsModule,
        RemindersModule,
        WhatsappUsageModule,
    ],
    exports: [CapabilitiesModule, StaffClassificationModule, ChannelsModule, AudiencesModule, AnnouncementsModule, MeModule],
})
export class CommunicationsModule {}
