import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { UsersController } from './users.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, NotificationPreferencesService, PrismaService],
  exports: [UsersService]
})
export class UsersModule { }
