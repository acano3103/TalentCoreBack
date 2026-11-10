import { Module } from '@nestjs/common';
import { AttendanceTrackingConfigService } from './attendance-config.service';
import { AttendanceTrackingConfigController } from './attendance-config.controller';

@Module({
  controllers: [AttendanceTrackingConfigController],
  providers: [AttendanceTrackingConfigService],
  exports: [AttendanceTrackingConfigService],
})
export class AttendanceTrackingConfigModule { }
