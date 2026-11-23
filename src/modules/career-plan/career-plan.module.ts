import { Module } from '@nestjs/common';
import { CareerPlanService } from './career-plan.service';
import { CareerPlanController } from './career-plan.controller';

@Module({
  controllers: [CareerPlanController],
  providers: [CareerPlanService],
  exports: [CareerPlanService],
})
export class CareerPlanModule {}
