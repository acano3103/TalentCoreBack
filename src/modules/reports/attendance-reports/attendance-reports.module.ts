import { Module } from '@nestjs/common';
import { AttendanceReportsService } from './attendance-reports.service';
import { AttendanceReportsController } from './attendance-reports.controller';
import { ExcelExportModule } from 'src/common/services/excel-export.module';
import { AttendanceTrackingConfigModule } from 'src/modules/config/attendance-config/attendance-config.module';

@Module({
  imports: [ExcelExportModule, AttendanceTrackingConfigModule],
  controllers: [AttendanceReportsController],
  providers: [AttendanceReportsService],
})
export class AttendanceReportsModule { }
