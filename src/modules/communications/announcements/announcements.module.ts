import { Module } from '@nestjs/common';
import { ExcelExportModule } from 'src/common/services/excel-export.module';
import { AudiencesModule } from '../audiences/audiences.module';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { ChannelsModule } from '../channels/channels.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { AnnouncementAnalyticsController } from './announcement-analytics.controller';
import { AnnouncementAnalyticsService } from './announcement-analytics.service';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { CommsFilesController } from './comms-files.controller';
import { CommsStorageService } from './comms-storage.service';

@Module({
    imports: [CapabilitiesModule, AudiencesModule, ChannelsModule, DeliveryModule, ExcelExportModule],
    controllers: [AnnouncementsController, AnnouncementAnalyticsController, CommsFilesController],
    providers: [AnnouncementsService, AnnouncementAnalyticsService, CommsStorageService],
    exports: [CommsStorageService],
})
export class AnnouncementsModule {}
