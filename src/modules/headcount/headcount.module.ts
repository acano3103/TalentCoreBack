import { Module } from '@nestjs/common';
import { HeadcountController } from './headcount.controller';
import { HeadcountService } from './headcount.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [HeadcountController],
  providers: [HeadcountService, PrismaService]
})
export class HeadcountModule { }
