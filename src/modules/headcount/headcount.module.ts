import { Module } from '@nestjs/common';
import { HeadcountController } from './headcount.controller';
import { HeadcountService } from './headcount.service';

@Module({
  controllers: [HeadcountController],
  providers: [HeadcountService]
})
export class HeadcountModule { }
