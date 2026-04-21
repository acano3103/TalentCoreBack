import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller'
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthDataService } from './queries/auth.queries';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
    imports: [
        PrismaModule,
        NotificationsModule,
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
        AuthDataService
    ],
    controllers: [AuthController],
})
export class AuthModule { }