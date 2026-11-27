import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PersonnelDashboardController } from './personnel-dashboard.controller';
import { PersonnelDashboardService } from './personnel-dashboard.service';

@Module({
  imports: [PrismaModule],
  controllers: [PersonnelDashboardController],
  providers: [PersonnelDashboardService],
  exports: [PersonnelDashboardService],
})
export class PersonnelDashboardModule { }