import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { IntegrationsModule } from '../integrations/integrations.module';
import { EmployeeBiometricsController } from './employee-biometrics/employee-biometrics.controller';
import { EmployeeBiometricsService } from './employee-biometrics/employee-biometrics.service';
import { EmployeeSchedulesModule } from './employee-schedules/employee-schedules.module';

@Module({
  imports: [IntegrationsModule, EmployeeSchedulesModule],
  controllers: [EmployeesController, EmployeeBiometricsController],
  providers: [EmployeesService, EmployeeBiometricsService],
  exports: [EmployeesService]
})
export class EmployeesModule { }