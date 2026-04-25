import { Module } from '@nestjs/common';
import { InterviewsService } from './interviews.service';
import { InterviewsController } from './interviews.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [PrismaModule, IntegrationsModule, NotificationsModule],
  controllers: [InterviewsController],
  providers: [InterviewsService],
})
export class InterviewsModule { }
