import { Module } from '@nestjs/common';
import { VacationsModule } from './vacations/vacations.module';

export const INCIDENTS_SUBMODULES = [
  VacationsModule
];

@Module({
  imports: [...INCIDENTS_SUBMODULES],
  exports: [...INCIDENTS_SUBMODULES],
})
export class IncidentsModule { }
