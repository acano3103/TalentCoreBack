import { Module } from '@nestjs/common';
import { OrganizationChartController } from './organization-chart.controller';
import { OrganizationChartService } from './organization-chart.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [OrganizationChartController],
  providers: [OrganizationChartService, PrismaService]
})
export class OrganizationChartModule { }
