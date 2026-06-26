import { Module } from '@nestjs/common';
import { VacanciesService } from './vacancies.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { VacanciesController } from './vacancies.controller';

@Module({
  providers: [VacanciesService, PrismaService],
  controllers: [VacanciesController],
  exports: [VacanciesService]
})
export class VacanciesModule { }
