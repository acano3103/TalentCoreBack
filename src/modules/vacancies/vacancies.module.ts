import { Module } from '@nestjs/common';
import { VacanciesService } from './vacancies.service';
import { VacanciesController } from './vacancies.controller';
import { PublicVacanciesController } from './public-vacancies.controller';

@Module({
  providers: [VacanciesService],
  controllers: [VacanciesController, PublicVacanciesController],
  exports: [VacanciesService]
})
export class VacanciesModule { }
