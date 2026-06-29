import { Module } from '@nestjs/common';
import { VacanciesService } from './vacancies.service';
import { VacanciesController } from './vacancies.controller';

@Module({
  providers: [VacanciesService],
  controllers: [VacanciesController],
  exports: [VacanciesService]
})
export class VacanciesModule { }
