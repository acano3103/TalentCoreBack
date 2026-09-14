import { Module } from '@nestjs/common';
import { LegalWorkdayService } from './legal-workday.service';
import { LegalWorkdayController } from './legal-workday.controller';

@Module({
  controllers: [LegalWorkdayController],
  providers: [LegalWorkdayService],
})
export class LegalWorkdayModule {}
