import { Module } from '@nestjs/common';
import { AttendanceEngineModule } from '../../attendance/engine/attendance-engine.module';
import { AttendanceTrackingConfigModule } from '../../config/attendance-config/attendance-config.module';
import { KioskDeviceController } from './kiosk-device.controller';
import { KioskDeviceService } from './kiosk-device.service';

@Module({
    imports: [AttendanceEngineModule, AttendanceTrackingConfigModule],
    controllers: [KioskDeviceController],
    providers: [KioskDeviceService],
})
export class KioskDeviceModule {}
