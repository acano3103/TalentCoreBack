import { Module } from '@nestjs/common';
import { CapabilitiesModule } from './capabilities/capabilities.module';
import { StaffClassificationModule } from './staff-classification/staff-classification.module';

@Module({
    imports: [CapabilitiesModule, StaffClassificationModule],
    exports: [CapabilitiesModule, StaffClassificationModule],
})
export class CommunicationsModule {}
