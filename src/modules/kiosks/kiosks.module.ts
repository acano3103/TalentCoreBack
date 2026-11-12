import { Module } from '@nestjs/common';
import { AttendanceEngineModule } from '../attendance/engine/attendance-engine.module';
import { AttendanceTrackingConfigModule } from '../config/attendance-config/attendance-config.module';
import { KioskAuthModule } from './kiosk-auth/kiosk-auth.module';
import { KioskDeviceModule } from './kiosk-device/kiosk-device.module';
import { KioskReviewsController } from './kiosk-reviews/kiosk-reviews.controller';
import { KioskReviewsService } from './kiosk-reviews/kiosk-reviews.service';
import { KiosksService } from './kiosks.service';
import { KiosksController } from './kiosks.controller';

@Module({
  imports: [AttendanceTrackingConfigModule, AttendanceEngineModule, KioskAuthModule, KioskDeviceModule],
  // reviews va antes de :id para que GET .../kiosks/reviews no caiga en el detalle.
  controllers: [KioskReviewsController, KiosksController],
  providers: [KiosksService, KioskReviewsService],
})
export class KiosksModule {}
