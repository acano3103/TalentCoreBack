import { Module } from '@nestjs/common';
import { WorkShiftsService } from './work-shifts.service';
import { WorkShiftsController } from './work-shifts.controller';

@Module({
  controllers: [WorkShiftsController],
  providers: [WorkShiftsService],
})
export class WorkShiftsModule {}
