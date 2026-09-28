import { Module } from '@nestjs/common';
import { AttendanceEngineModule } from 'src/modules/attendance/engine/attendance-engine.module';
import { MobileAuthModule } from '../mobile-auth/mobile-auth.module';
import { MobileAttendanceController } from './mobile-attendance.controller';
import { MobileAttendanceService } from './mobile-attendance.service';

@Module({
    imports: [MobileAuthModule, AttendanceEngineModule],
    controllers: [MobileAttendanceController],
    providers: [MobileAttendanceService],
})
export class MobileAttendanceModule {}
