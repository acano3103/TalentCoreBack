import { Module } from '@nestjs/common';
import { AudiencesModule } from './audiences/audiences.module';
import { CapabilitiesModule } from './capabilities/capabilities.module';
import { ChannelsModule } from './channels/channels.module';
import { StaffClassificationModule } from './staff-classification/staff-classification.module';

@Module({
    imports: [CapabilitiesModule, StaffClassificationModule, ChannelsModule, AudiencesModule],
    exports: [CapabilitiesModule, StaffClassificationModule, ChannelsModule, AudiencesModule],
})
export class CommunicationsModule {}
