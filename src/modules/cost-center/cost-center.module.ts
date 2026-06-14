import { Module } from '@nestjs/common';
import { CostCenterService } from './cost-center.service';
import { CostCenterController } from './cost-center.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  providers: [CostCenterService, PrismaService],
  controllers: [CostCenterController]
})
export class CostCenterModule { }
