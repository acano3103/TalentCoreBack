import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceTrackingConfigModule } from '../config/attendance-config/attendance-config.module';

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService],
  imports: [AttendanceTrackingConfigModule],
})
export class AttendanceModule { }
