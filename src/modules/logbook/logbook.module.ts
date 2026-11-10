import { Module } from '@nestjs/common';
import { LogbookService } from './logbook.service';
import { LogbookController } from './logbook.controller';
import { ExcelExportModule } from 'src/common/services/excel-export.module';

@Module({
  imports: [ExcelExportModule],
  controllers: [LogbookController],
  providers: [LogbookService],
})
export class LogbookModule {}