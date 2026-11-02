import { Module } from '@nestjs/common';
import { TrainingDashboardService } from './training-dashboard.service';
import { TrainingDashboardController } from './training-dashboard.controller';

@Module({
  controllers: [TrainingDashboardController],
  providers: [TrainingDashboardService],
})
export class TrainingDashboardModule {}
