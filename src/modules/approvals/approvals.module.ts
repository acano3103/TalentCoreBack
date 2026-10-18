import { Module } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';
import { PersonnelConfigModule } from '../config/personnel-config/personnel-config.module';

@Module({
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  imports: [PersonnelConfigModule],
  exports: [ApprovalsService],
})
export class ApprovalsModule { }
