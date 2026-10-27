import { Module } from '@nestjs/common';
import { MobileIncidentsController } from './mobile-incidents.controller';
import { IncidentsModule } from 'src/modules/incidents/incidents.module';
import { VacationsModule } from 'src/modules/incidents/vacations/vacations.module';
import { PermissionsModule } from 'src/modules/incidents/permissions/permissions.module';
import { IncapacitiesModule } from 'src/modules/incidents/incapacities/incapacities.module';

@Module({
  controllers: [MobileIncidentsController],
  providers: [],
  imports: [
    IncidentsModule,
    VacationsModule,
    PermissionsModule,
    IncapacitiesModule
  ],
})
export class MobileIncidentsModule { }
