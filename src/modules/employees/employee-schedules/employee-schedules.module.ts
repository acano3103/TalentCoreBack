import { Module } from '@nestjs/common';
import { EmployeeSchedulesService } from './employee-schedules.service';
import { EmployeeSchedulesController } from './employee-schedules.controller';

@Module({
  controllers: [EmployeeSchedulesController],
  providers: [EmployeeSchedulesService],
})
export class EmployeeSchedulesModule {}
