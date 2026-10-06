import { Module } from '@nestjs/common';
import { CostCenterService } from './cost-center.service';
import { CostCenterController } from './cost-center.controller';
import { ExcelExportModule } from 'src/common/services/excel-export.module';

@Module({
  imports: [ExcelExportModule],
  providers: [CostCenterService],
  controllers: [CostCenterController]
})
export class CostCenterModule { }