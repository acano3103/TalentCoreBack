import { Module } from '@nestjs/common';
import { MobileAuthModule } from '../mobile-auth/mobile-auth.module';
import { AttendanceDevicesController, MobileDevicesController } from './mobile-devices.controller';
import { MobileDevicesService } from './mobile-devices.service';

@Module({
    imports: [MobileAuthModule],
    controllers: [MobileDevicesController, AttendanceDevicesController],
    providers: [MobileDevicesService],
    exports: [MobileDevicesService],
})
export class MobileDevicesModule {}
