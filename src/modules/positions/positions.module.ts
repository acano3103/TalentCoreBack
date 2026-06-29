import { Module } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { PositionsController } from './positions.controller';
import { NotificationsModule } from 'src/modules/notifications/notifications.module';
import { OrganizationChartModule } from './organization-chart/organization-chart.module';

@Module({
  providers: [PositionsService],
  controllers: [PositionsController],
  imports: [NotificationsModule, OrganizationChartModule]
})
export class PositionsModule { }
