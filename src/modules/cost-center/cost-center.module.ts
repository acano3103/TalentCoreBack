import { Module } from '@nestjs/common';
import { CostCenterService } from './cost-center.service';
import { CostCenterController } from './cost-center.controller';

@Module({
  providers: [CostCenterService],
  controllers: [CostCenterController]
})
export class CostCenterModule { }
