import { Module } from '@nestjs/common';
import { VacationsModule } from './vacations/vacations.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { PersonnelConfigModule } from '../config/personnel-config/personnel-config.module';
import { ApprovalsModule } from '../approvals/approvals.module';

export const INCIDENTS_SUBMODULES = [
  VacationsModule
];

@Module({
  imports: [...INCIDENTS_SUBMODULES, ApprovalsModule],
  exports: [...INCIDENTS_SUBMODULES, IncidentsService],
  controllers: [IncidentsController],
  providers: [IncidentsService],
})
export class IncidentsModule { }
