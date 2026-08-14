import { Module } from '@nestjs/common';
import { InternalMovementsService } from './internal-movements.service';
import {
  InternalMovementsController,
  CompanyMovementsController,
} from './internal-movements.controller';
import { NotificationsModule } from 'src/modules/notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [InternalMovementsController, CompanyMovementsController],
  providers: [InternalMovementsService],
})
export class InternalMovementsModule {}
