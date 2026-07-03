import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { VacanciesService } from './vacancies.service';

@ApiTags('Public Vacancies')
@Controller('job-board/companies/:companyId/vacancies')
export class PublicVacanciesController {
  constructor(private readonly vacanciesService: VacanciesService) { }

  @Get()
  @ApiOperation({ summary: 'Obtener vacantes activas públicas filtradas (sin autenticación)' })
  @ApiResponse({ status: 200, description: 'Lista de vacantes activas filtradas.' })
  @ApiQuery({ name: 'locationId', required: false, type: Number })
  @ApiQuery({ name: 'areaId', required: false, type: Number })
  @ApiQuery({ name: 'minSalary', required: false, type: Number })
  @ApiQuery({ name: 'maxSalary', required: false, type: Number })
  async getPublicActiveVacancies(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('locationId') locationId?: string,
    @Query('areaId') areaId?: string,
    @Query('minSalary') minSalary?: string,
    @Query('maxSalary') maxSalary?: string,
  ) {
    return this.vacanciesService.findPublicActiveVacancies(
      companyId,
      locationId ? Number(locationId) : null,
      areaId ? Number(areaId) : null,
      minSalary ? Number(minSalary) : null,
      maxSalary ? Number(maxSalary) : null,
    );
  }

  @Get('/:vacancyId')
  @ApiOperation({ summary: 'Obtener vacante activa pública por ID (sin autenticación)' })
  @ApiResponse({ status: 200, description: 'Detalles de la vacante activa.' })
  async getPublicActiveVacancyById(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('vacancyId', ParseIntPipe) vacancyId: number,
  ) {
    return this.vacanciesService.findPublicActiveVacancyById(companyId, vacancyId);
  }
}
