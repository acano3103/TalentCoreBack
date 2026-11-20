import { Module } from '@nestjs/common';
import { AudiencesModule } from '../audiences/audiences.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { CommsHousekeepingService } from './comms-housekeeping.service';
import { CommsNewMembersService } from './comms-new-members.service';

@Module({
    imports: [AudiencesModule, DeliveryModule],
    providers: [CommsHousekeepingService, CommsNewMembersService],
})
export class HousekeepingModule {}
