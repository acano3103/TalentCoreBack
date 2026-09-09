import { Module } from '@nestjs/common';
import { MobileAuthModule } from './mobile-auth/mobile-auth.module';
import { MobileDashboardModule } from './mobile-dashboard/mobile-dashboard.module';

export const MOBILE_SUBMODULES = [
  MobileAuthModule,
  MobileDashboardModule,
];

@Module({
  imports: [...MOBILE_SUBMODULES],
  exports: [...MOBILE_SUBMODULES],
})
export class MobileModule { }
