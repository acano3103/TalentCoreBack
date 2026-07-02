import { Module } from '@nestjs/common';
import { VacanciesService } from './vacancies.service';
import { VacanciesController } from './vacancies.controller';
import { PublicVacanciesController } from './public-vacancies.controller';
import { UsersService } from '../users/users.service';

@Module({
  providers: [VacanciesService, UsersService],
  controllers: [VacanciesController, PublicVacanciesController],
  exports: [VacanciesService]
})
export class VacanciesModule { }
