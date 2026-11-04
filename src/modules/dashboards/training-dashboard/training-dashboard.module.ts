import { Module } from '@nestjs/common';
import { TrainingDashboardService } from './training-dashboard.service';
import { TrainingDashboardController } from './training-dashboard.controller';
import { TrainingParticipantsService } from './training-participants.service';
import { ExcelExportModule } from 'src/common/services/excel-export.module';

@Module({
  imports: [ExcelExportModule],
  controllers: [TrainingDashboardController],
  providers: [TrainingDashboardService, TrainingParticipantsService],
})
export class TrainingDashboardModule {}
