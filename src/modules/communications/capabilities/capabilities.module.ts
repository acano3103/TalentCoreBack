import { Module } from '@nestjs/common';
import { CommsCapabilitiesController } from './comms-capabilities.controller';
import { CommsCapabilityGuard } from './comms-capability.guard';
import { CommsCapabilityService } from './comms-capability.service';
import { MeCommsCapabilitiesController } from './me-comms-capabilities.controller';
import { MobileCommsCapabilitiesController } from './mobile-comms-capabilities.controller';

@Module({
    controllers: [CommsCapabilitiesController, MeCommsCapabilitiesController, MobileCommsCapabilitiesController],
    providers: [CommsCapabilityService, CommsCapabilityGuard],
    exports: [CommsCapabilityService, CommsCapabilityGuard],
})
export class CapabilitiesModule {}
