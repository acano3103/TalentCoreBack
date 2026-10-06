import { Module } from '@nestjs/common';
import { HeadcountController } from './headcount.controller';
import { HeadcountService } from './headcount.service';
import { ExcelExportModule } from 'src/common/services/excel-export.module';

@Module({
  imports: [ExcelExportModule],
  controllers: [HeadcountController],
  providers: [HeadcountService]
})
export class HeadcountModule { }