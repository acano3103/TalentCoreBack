import { Module } from '@nestjs/common';
import { AttendanceDashboardService } from './attendance-dashboard.service';
import { AttendanceDashboardController } from './attendance-dashboard.controller';

@Module({
  controllers: [AttendanceDashboardController],
  providers: [AttendanceDashboardService],
})
export class AttendanceDashboardModule {}
