import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceTrackingConfigModule } from '../config/attendance-config/attendance-config.module';
import { AttendanceEngineModule } from './engine/attendance-engine.module';
import { AttendanceJobsService } from './jobs/attendance-jobs.service';

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceJobsService],
  imports: [AttendanceTrackingConfigModule, AttendanceEngineModule],
})
export class AttendanceModule {}
