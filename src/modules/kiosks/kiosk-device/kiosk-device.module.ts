import { Module } from '@nestjs/common';
import { MediaPathModule } from '../../../common/services/media-path.module';
import { AttendanceEngineModule } from '../../attendance/engine/attendance-engine.module';
import { AttendanceTrackingConfigModule } from '../../config/attendance-config/attendance-config.module';
import { KioskDeviceController } from './kiosk-device.controller';
import { KioskDeviceService } from './kiosk-device.service';

@Module({
    imports: [AttendanceEngineModule, AttendanceTrackingConfigModule, MediaPathModule],
    controllers: [KioskDeviceController],
    providers: [KioskDeviceService],
    exports: [KioskDeviceService],
})
export class KioskDeviceModule {}
