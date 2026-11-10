import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport'; // <-- 1. Importar PassportModule
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MobileAuthController } from './mobile-auth.controller';
import { MobileAuthService } from './mobile-auth.service';
import { MobileJwtStrategy } from './strategies/mobile-jwt.strategy'; // <-- 2. Importar Estrategia
import { UsersModule } from 'src/modules/users/users.module';
import { NotificationsModule } from 'src/modules/notifications/notifications.module';
import { AuthDataService } from 'src/modules/auth/queries/auth.queries';
import { CaptchaService } from 'src/modules/auth/providers/captcha.service';

@Module({
  imports: [
    UsersModule,
    NotificationsModule,
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt-mobile' }), // <-- 3. Registrar Passport
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [MobileAuthController],
  providers: [
    MobileAuthService,
    MobileJwtStrategy, // <-- 4. Añadir proveedor
    AuthDataService,
    CaptchaService,
  ],
  exports: [MobileAuthService, PassportModule, JwtModule], // <-- 5. Exportar PassportModule
})
export class MobileAuthModule { }