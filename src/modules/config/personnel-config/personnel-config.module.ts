import { Module } from '@nestjs/common';
import { PersonnelConfigService } from './personnel-config.service';
import { PersonnelConfigController } from './personnel-config.controller';

@Module({
  controllers: [PersonnelConfigController],
  providers: [PersonnelConfigService],
  exports: [PersonnelConfigService],
})
export class PersonnelConfigModule { }
