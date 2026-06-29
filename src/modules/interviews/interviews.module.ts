import { Module } from '@nestjs/common';
import { InterviewsService } from './interviews.service';
import { InterviewsController } from './interviews.controller';
import { IntegrationsModule } from '../integrations/integrations.module';
import { NotificationsModule } from 'src/modules/notifications/notifications.module';

@Module({
  imports: [IntegrationsModule, NotificationsModule],
  controllers: [InterviewsController],
  providers: [InterviewsService],
})
export class InterviewsModule { }
