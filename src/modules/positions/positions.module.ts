import { Module } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { PositionsController } from './positions.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  providers: [PositionsService, PrismaService],
  controllers: [PositionsController],
  imports: [NotificationsModule]
})
export class PositionsModule { }
