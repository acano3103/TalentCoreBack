import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { VacanciesService } from './vacancies.service';

@ApiTags('Public Vacancies')
@Controller('job-board/companies/:companyId/vacancies')
export class PublicVacanciesController {
  constructor(private readonly vacanciesService: VacanciesService) {}

  @Get()
  @ApiOperation({
    summary: 'Obtener vacantes activas públicas (sin autenticación)',
    description:
      'Endpoint público para la bolsa de trabajo. Retorna vacantes activas con información completa de puesto, área, modalidad y site.',
  })
  @ApiResponse({ status: 200, description: 'Lista de vacantes activas.' })
  async getPublicActiveVacancies(
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.vacanciesService.findPublicActiveVacancies(companyId);
  }
}
