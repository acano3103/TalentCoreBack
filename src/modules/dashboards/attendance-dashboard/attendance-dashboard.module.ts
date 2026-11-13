import { Module } from '@nestjs/common';
import { AttendanceTrackingConfigModule } from 'src/modules/config/attendance-config/attendance-config.module';
import { AttendanceDashboardService } from './attendance-dashboard.service';
import { AttendanceDashboardController } from './attendance-dashboard.controller';

@Module({
  imports: [AttendanceTrackingConfigModule],
  controllers: [AttendanceDashboardController],
  providers: [AttendanceDashboardService],
})
export class AttendanceDashboardModule {}
