import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../configuration/configuration.module';
import { InternalMovementsModule } from '../internal-movements/internal-movements.module';
import { LearningPathsModule } from '../learning-paths/learning-paths.module';
import { CareerPlanService } from './career-plan.service';
import { CareerPlanController } from './career-plan.controller';

@Module({
  imports: [ConfigurationModule, InternalMovementsModule, LearningPathsModule],
  controllers: [CareerPlanController],
  providers: [CareerPlanService],
  exports: [CareerPlanService],
})
export class CareerPlanModule {}
