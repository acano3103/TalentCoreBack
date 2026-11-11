import { Module } from '@nestjs/common';
import { AttendanceTrackingConfigModule } from '../config/attendance-config/attendance-config.module';
import { KioskAuthModule } from './kiosk-auth/kiosk-auth.module';
import { KioskDeviceModule } from './kiosk-device/kiosk-device.module';
import { KiosksService } from './kiosks.service';
import { KiosksController } from './kiosks.controller';

@Module({
  imports: [AttendanceTrackingConfigModule, KioskAuthModule, KioskDeviceModule],
  controllers: [KiosksController],
  providers: [KiosksService],
})
export class KiosksModule {}
