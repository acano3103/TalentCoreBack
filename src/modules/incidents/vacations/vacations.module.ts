
import { Module, forwardRef } from '@nestjs/common';
import { VacationsService } from './vacations.service';
import { VacationsController } from './vacations.controller';
import { EmployeesModule } from 'src/modules/employees/employees.module';
import { PersonnelConfigModule } from 'src/modules/config/personnel-config/personnel-config.module';
import { ApprovalsModule } from 'src/modules/approvals/approvals.module';

@Module({
  controllers: [VacationsController],
  providers: [VacationsService],
  imports: [
    EmployeesModule,
    PersonnelConfigModule,
    forwardRef(() => ApprovalsModule),
  ],
  exports: [VacationsService]
})
export class VacationsModule { }
