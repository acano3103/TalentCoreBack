import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { MeModule } from '../me/me.module';
import { LinkThrottle } from './link-throttle';
import { LinkThrottleGuard } from './link-throttle.guard';
import { PublicLinksController } from './public-links.controller';
import { PublicLinksService } from './public-links.service';

@Module({
    imports: [
        AnnouncementsModule,
        MeModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.get<string>('JWT_SECRET'),
                signOptions: { algorithm: 'HS256' as const, expiresIn: '15m', audience: 'comms-link' },
            }),
        }),
    ],
    controllers: [PublicLinksController],
    providers: [PublicLinksService, LinkThrottle, LinkThrottleGuard],
})
export class PublicLinksModule {}
