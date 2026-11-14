import { Module } from '@nestjs/common';
import { AudiencesModule } from '../audiences/audiences.module';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { ChannelsModule } from '../channels/channels.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { CommsFilesController } from './comms-files.controller';
import { CommsStorageService } from './comms-storage.service';

@Module({
    imports: [CapabilitiesModule, AudiencesModule, ChannelsModule, DeliveryModule],
    controllers: [AnnouncementsController, CommsFilesController],
    providers: [AnnouncementsService, CommsStorageService],
    exports: [CommsStorageService],
})
export class AnnouncementsModule {}
