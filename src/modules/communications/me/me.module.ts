import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MobileAuthModule } from 'src/modules/mobile/mobile-auth/mobile-auth.module';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { CommsAckService } from './comms-ack.service';
import { MeCommsController } from './me-comms.controller';
import { MeCommsService } from './me-comms.service';
import { MobileCommsController } from './mobile-comms.controller';
import { crearSnoozeStore, SnoozeStore } from './snooze.store';

@Module({
    imports: [AnnouncementsModule, MobileAuthModule],
    controllers: [MeCommsController, MobileCommsController],
    providers: [
        MeCommsService,
        CommsAckService,
        {
            provide: SnoozeStore,
            useFactory: (config: ConfigService) => crearSnoozeStore(config.get<string>('REDIS_URL')),
            inject: [ConfigService],
        },
    ],
    exports: [CommsAckService],
})
export class MeModule {}
