import { Module } from '@nestjs/common';
import { AttendanceTrackingConfigModule } from 'src/modules/config/attendance-config/attendance-config.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AttendanceEngineService } from './attendance-engine.service';

@Module({
  imports: [AttendanceTrackingConfigModule, PrismaModule],
  providers: [AttendanceEngineService],
  exports: [AttendanceEngineService],
})
export class AttendanceEngineModule {}
