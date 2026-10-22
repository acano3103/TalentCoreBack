import { forwardRef, Module } from '@nestjs/common';
import { InternalMovementsService } from './internal-movements.service';
import {
  InternalMovementsController,
  CompanyMovementsController,
} from './internal-movements.controller';
import { NotificationsModule } from 'src/modules/notifications/notifications.module';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [
    NotificationsModule,
    forwardRef(() => ApprovalsModule),
  ],
  controllers: [InternalMovementsController, CompanyMovementsController],
  providers: [InternalMovementsService],
})
export class InternalMovementsModule { }
