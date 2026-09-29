import { Module } from '@nestjs/common';
import { MobileAuthModule } from './mobile-auth/mobile-auth.module';
import { MobileDashboardModule } from './mobile-dashboard/mobile-dashboard.module';
import { MobileAttendanceModule } from './mobile-attendance/mobile-attendance.module';
import { MobileDevicesModule } from './mobile-devices/mobile-devices.module';

export const MOBILE_SUBMODULES = [
  MobileAuthModule,
  MobileDashboardModule,
  MobileDevicesModule,
  MobileAttendanceModule,
];

@Module({
  imports: [...MOBILE_SUBMODULES],
  exports: [...MOBILE_SUBMODULES],
})
export class MobileModule { }
