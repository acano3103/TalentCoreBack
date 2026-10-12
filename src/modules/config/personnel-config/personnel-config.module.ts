import { Module } from '@nestjs/common';
import { PersonnelConfigService } from './personnel-config.service';
import { PersonnelConfigController } from './personnel-config.controller';

@Module({
  controllers: [PersonnelConfigController],
  providers: [PersonnelConfigService],
})
export class PersonnelConfigModule {}
