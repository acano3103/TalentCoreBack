import { Module } from '@nestjs/common';
import { LogbookService } from './logbook.service';
import { LogbookController } from './logbook.controller';

@Module({
  controllers: [LogbookController],
  providers: [LogbookService],
})
export class LogbookModule {}
