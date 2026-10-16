import { Module } from '@nestjs/common';
import { VacationsService } from './vacations.service';
import { VacationsController } from './vacations.controller';
import { EmployeesModule } from 'src/modules/employees/employees.module';
import { PersonnelConfigModule } from 'src/modules/config/personnel-config/personnel-config.module';

@Module({
  controllers: [VacationsController],
  providers: [VacationsService],
  imports: [EmployeesModule, PersonnelConfigModule]
})
export class VacationsModule { }
