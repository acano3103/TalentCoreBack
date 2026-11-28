import { Module } from '@nestjs/common';
import { OrganizationalDashboardController } from './organizational-dashboard.controller';
import { OrganizationalDashboardService } from './organizational-dashboard.service';

@Module({
  controllers: [OrganizationalDashboardController],
  providers: [OrganizationalDashboardService],
})
export class OrganizationalDashboardModule {}
