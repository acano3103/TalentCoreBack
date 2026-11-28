import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RecruitmentDashboardService } from './recluitment-dashboard.service';
import { RecruitmentDashboardController } from './recluitment-dashboard.controller';

@Module({
  imports: [PrismaModule],
  controllers: [RecruitmentDashboardController],
  providers: [RecruitmentDashboardService],
  exports: [RecruitmentDashboardService],
})
export class RecruitmentDashboardModule { }