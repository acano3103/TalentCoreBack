import { Module } from '@nestjs/common';
import { VacationsModule } from './vacations/vacations.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { PermissionsModule } from './permissions/permissions.module';
import { IncapacitiesModule } from './incapacities/incapacities.module';

export const INCIDENTS_SUBMODULES = [
  VacationsModule,
  PermissionsModule,
  IncapacitiesModule
];

@Module({
  imports: [...INCIDENTS_SUBMODULES],
  exports: [...INCIDENTS_SUBMODULES, IncidentsService],
  controllers: [IncidentsController],
  providers: [IncidentsService],
})
export class IncidentsModule { }