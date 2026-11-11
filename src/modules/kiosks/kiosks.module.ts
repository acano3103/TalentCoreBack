import { Module } from '@nestjs/common';
import { AttendanceTrackingConfigModule } from '../config/attendance-config/attendance-config.module';
import { KiosksService } from './kiosks.service';
import { KiosksController } from './kiosks.controller';

@Module({
  imports: [AttendanceTrackingConfigModule],
  controllers: [KiosksController],
  providers: [KiosksService],
})
export class KiosksModule {}
