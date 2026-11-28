import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { DigitalFileDashboardController } from './digital-files-dashboard.controller';
import { DigitalFileDashboardService } from './digital-files-dashboard.service';

@Module({
  imports: [PrismaModule],
  controllers: [DigitalFileDashboardController],
  providers: [DigitalFileDashboardService],
  exports: [DigitalFileDashboardService],
})
export class DigitalFileDashboardModule { }