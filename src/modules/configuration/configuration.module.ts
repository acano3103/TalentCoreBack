import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigurationService } from './configuration.service';
import { ConfigurationController } from './configuration.controller';
import { TrainingConfigCacheInterceptor } from './training-config.interceptor';

@Module({
  controllers: [ConfigurationController],
  providers: [
    ConfigurationService,
    { provide: APP_INTERCEPTOR, useClass: TrainingConfigCacheInterceptor },
  ],
  exports: [ConfigurationService],
})
export class ConfigurationModule {}
