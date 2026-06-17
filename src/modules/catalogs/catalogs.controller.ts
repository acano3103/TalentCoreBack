import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CatalogsService, CatalogKey } from './catalogs.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { SalaryLevelsCatalogService } from './sub-services/salary-levels-catalog.service';
import { UpdateSalaryLevelsCatalogDto } from './dto/update-salary-levels-catalog.dto';
import { CreateSalaryLevelsCatalogDto } from './dto/create-salary-levels-catalog.dto';
import { PatronalRecordsService } from './sub-services/patronal-records.service';

@UseGuards(JwtAuthGuard)
@ApiTags('Catalogs')
@Controller('companies/:companyId/')
export class CatalogsController {
  constructor(
    private readonly catalogsService: CatalogsService,
    private readonly salaryLevelsCatalogService: SalaryLevelsCatalogService,
    private readonly patronalRecordsService: PatronalRecordsService,
  ) { }

  @Get('catalogs/:nombre')
  @ApiParam({
    name: 'nombre',
    description: 'Nombre del catálogo a consultar',
    enum: ['roles', 'empresas', 'sites', 'modulos', 'areas', 'tipos-contratacion', 'modalidades'],
  })
  @ApiOperation({
    summary: 'Obtener catálogo genérico',
    description:
      'Retorna los registros activos del catálogo indicado en el path param. ' +
      'Valores aceptados: roles, empresas, sites, modulos, areas, tipos-contratacion, modalidades.',
  })
  @ApiResponse({ status: 200, description: 'Lista de registros del catálogo.' })
  @ApiResponse({ status: 400, description: 'Catálogo no reconocido.' })
  getCatalog(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('nombre') nombre: string
  ) {
    return this.catalogsService.getCatalog(companyId, nombre as CatalogKey);
  }

  // ==========================================
  // ENDPOINTS: Salary levels subservice
  // ==========================================

  @Get('salary-levels')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all salary levels', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Salary levels obtained successfully' })
  @ApiResponse({ status: 404, description: 'Salary levels not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async findAllSalaryLevels(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    const querySearch = search || '';
    return this.salaryLevelsCatalogService.findAll(companyId, page, limit, querySearch);
  }

  @Get('salary-levels/:salaryLevelId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get one salary level', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Salary level obtained successfully' })
  @ApiResponse({ status: 404, description: 'Salary level not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async findOne(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('salaryLevelId', ParseIntPipe) salaryLevelId: number,
  ) {
    return await this.salaryLevelsCatalogService.findOne(companyId, salaryLevelId);
  }

  @Post('salary-levels')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create salary level', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Salary level created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async create(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() createSalaryLevelsCatalogDto: CreateSalaryLevelsCatalogDto,
  ) {
    return await this.salaryLevelsCatalogService.create(companyId, createSalaryLevelsCatalogDto);
  }

  @Put('salary-levels/:salaryLevelId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update salary level', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Salary level updated successfully' })
  @ApiResponse({ status: 404, description: 'Salary level not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async update(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('salaryLevelId', ParseIntPipe) salaryLevelId: number,
    @Body() updateSalaryLevelsCatalogDto: UpdateSalaryLevelsCatalogDto,
  ) {
    return await this.salaryLevelsCatalogService.update(companyId, salaryLevelId, updateSalaryLevelsCatalogDto);
  }

  @Delete('salary-levels/:salaryLevelId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable salary level', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Salary level disabled successfully' })
  @ApiResponse({ status: 404, description: 'Salary level not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async disable(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('salaryLevelId', ParseIntPipe) salaryLevelId: number,
  ) {
    return this.salaryLevelsCatalogService.changeStatus(companyId, salaryLevelId, false);
  }

  @Patch('salary-levels/:salaryLevelId/reactivate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reactivate salary level', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Salary level reactivated successfully' })
  @ApiResponse({ status: 404, description: 'Salary level not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async reactivate(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('salaryLevelId', ParseIntPipe) salaryLevelId: number,
  ) {
    return this.salaryLevelsCatalogService.changeStatus(companyId, salaryLevelId, true);
  }

  // ==========================================
  // ENDPOINTS: Patronal records subservice
  // ==========================================

  @Get('patronal-records')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all patronal records', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Patronal records obtained successfully' })
  @ApiResponse({ status: 404, description: 'Patronal records not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async getPatronalRecords(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    const querySearch = search || '';
    return this.patronalRecordsService.findAll(companyId, page, limit, querySearch);
  }

  @Post('patronal-records')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create patronal record', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Patronal record created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async createPatronalRecord(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() body: { registroPatronal: string; razonSocial: string; claseRiesgo: string; primaRiesgo: number }
  ) {
    return this.patronalRecordsService.create(companyId, body);
  }

  @Put('patronal-records/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update patronal record', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Patronal record updated successfully' })
  @ApiResponse({ status: 404, description: 'Patronal record not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async updatePatronalRecord(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { registroPatronal?: string; razonSocial?: string; claseRiesgo?: string; primaRiesgo?: number }
  ) {
    return this.patronalRecordsService.update(id, body);
  }

  @Delete('patronal-records/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable patronal record', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Patronal record disabled successfully' })
  @ApiResponse({ status: 404, description: 'Patronal record not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async disablePatronalRecord(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.patronalRecordsService.changeStatus(companyId, id, false);
  }

  @Patch('patronal-records/:id/reactivate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reactivate patronal record', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Patronal record reactivated successfully' })
  @ApiResponse({ status: 404, description: 'Patronal record not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async reactivatePatronalRecord(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.patronalRecordsService.changeStatus(companyId, id, true);
  }
}
