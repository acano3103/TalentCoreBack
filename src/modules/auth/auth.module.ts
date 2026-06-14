import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller'
import { PrismaModule } from '../../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthDataService } from './queries/auth.queries';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from 'src/users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { CaptchaService } from './providers/captcha.service';

@Module({
    imports: [
        UsersModule,
        PrismaModule,
        NotificationsModule,
        PassportModule,
        JwtModule.registerAsync({
            useFactory: (config: ConfigService) => ({
                secret: config.get('JWT_SECRET'),
                signOptions: { algorithm: 'HS256' },
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [
        AuthService,
        AuthDataService,
        JwtStrategy,
        CaptchaService
    ],
    controllers: [AuthController],
    exports: [PassportModule]
})
export class AuthModule { }