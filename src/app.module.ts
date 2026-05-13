import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { envValidationSchema } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { ProfileModule } from './profile/profile.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    // Serve src/media/** as static files at /media/*
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'src', 'media'),
      serveRoot: '/media',
      serveStaticOptions: { index: false },
    }),
    PrismaModule,
    AuthModule,
    MailModule,
    ProfileModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
