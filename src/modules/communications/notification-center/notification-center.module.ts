import { Module } from '@nestjs/common';
import { MeNotificationsController } from './me-notifications.controller';
import { MobileNotificationsController } from './mobile-notifications.controller';
import { NotificationCenterService } from './notification-center.service';

@Module({
    controllers: [MeNotificationsController, MobileNotificationsController],
    providers: [NotificationCenterService],
})
export class NotificationCenterModule {}
