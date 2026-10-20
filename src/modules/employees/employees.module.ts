import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { IntegrationsModule } from '../integrations/integrations.module';
import { EmployeeBiometricsController } from './employee-biometrics.controller';
import { EmployeeBiometricsService } from './employee-biometrics.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [EmployeesController, EmployeeBiometricsController],
  providers: [EmployeesService, EmployeeBiometricsService],
  exports: [EmployeesService]
})
export class EmployeesModule { }
