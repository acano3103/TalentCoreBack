
import { Module, forwardRef } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';
import { PersonnelConfigModule } from '../config/personnel-config/personnel-config.module';
import { IncidentsModule } from '../incidents/incidents.module';

@Module({
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  imports: [
    PersonnelConfigModule,
    forwardRef(() => IncidentsModule),
  ],
  exports: [ApprovalsService],
})
export class ApprovalsModule { }
