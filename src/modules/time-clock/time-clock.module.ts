import { Module } from '@nestjs/common';
import { TimeClockService } from './time-clock.service';
import { TimeClockController } from './time-clock.controller';
import { AttendanceEngineModule } from '../attendance/engine/attendance-engine.module';

@Module({
  controllers: [TimeClockController],
  providers: [TimeClockService],
  imports: [AttendanceEngineModule],
})
export class TimeClockModule { }
