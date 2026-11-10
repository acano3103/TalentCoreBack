import { Module } from '@nestjs/common';
import { MobileDashboardController } from './mobile-dashboard.controller';
import { MobileDashboardService } from './mobile-dashboard.service';
import { MobileAuthModule } from '../mobile-auth/mobile-auth.module';

@Module({
  imports: [MobileAuthModule],
  controllers: [MobileDashboardController],
  providers: [MobileDashboardService]
})
export class MobileDashboardModule { }
