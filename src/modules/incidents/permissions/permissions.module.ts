import { Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';
import { PersonnelConfigModule } from 'src/modules/config/personnel-config/personnel-config.module';
import { EmployeesModule } from 'src/modules/employees/employees.module';
import { MediaPathModule } from 'src/common/services/media-path.module';
import { ApprovalsModule } from 'src/modules/approvals/approvals.module';

@Module({
  imports: [PersonnelConfigModule, EmployeesModule, MediaPathModule, ApprovalsModule],
  controllers: [PermissionsController],
  providers: [PermissionsService],
})
export class PermissionsModule { }
