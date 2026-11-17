import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { KioskAuthController } from './kiosk-auth.controller';
import { KioskActivationService } from './kiosk-activation.service';
import { KioskActivationRateLimiter } from './kiosk-activation-rate-limiter';
import { kioskJwtOptions } from './kiosk-jwt.options';
import { KioskJwtStrategy } from './strategies/kiosk-jwt.strategy';

@Module({
    imports: [
        ConfigModule,
        PassportModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: kioskJwtOptions,
        }),
    ],
    controllers: [KioskAuthController],
    providers: [KioskActivationService, KioskActivationRateLimiter, KioskJwtStrategy],
    exports: [PassportModule, KioskJwtStrategy],
})
export class KioskAuthModule {}
