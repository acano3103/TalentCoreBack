import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { PositionsModule } from './positions/positions.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { UsersModule } from './users/users.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { InterviewsModule } from './interviews/interviews.module';
import { PostulationsModule } from './postulations/postulations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    ServeStaticModule.forRoot(
      {
        rootPath: join(__dirname, '..', 'public'),
        serveRoot: '/public',
      },
      {
        rootPath: join(__dirname, '..', 'media'),
        serveRoot: '/media',
      }
    ),
    PrismaModule,
    AuthModule,
    PositionsModule,
    UsersModule,
    IntegrationsModule,
    InterviewsModule,
    PostulationsModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
