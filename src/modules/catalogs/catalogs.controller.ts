import { Body, Controller, DefaultValuePipe, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CatalogsService, CatalogKey } from './catalogs.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { SalaryLevelsCatalogService } from './sub-services/salary-levels-catalog.service';
import { UpdateSalaryLevelsCatalogDto } from './dto/update-salary-levels-catalog.dto';
import { CreateSalaryLevelsCatalogDto } from './dto/create-salary-levels-catalog.dto';
import { PatronalRecordsService } from './sub-services/patronal-records.service';
import { CreatePatronalRecordDto } from './dto/create-patronal-record.dto';
import { UpdatePatronalRecordDto } from './dto/update-patronal-record.dto';
import { OperatingUnitsService } from './sub-services/operating-units.service';
import { CreateOperatingUnitDto } from './dto/create-operating-unit.dto';
import { UpdateOperatingUnitDto } from './dto/update-operating-unit.dto';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@UseGuards(JwtAuthGuard)
@ApiTags('Catalogs')
@Controller('companies/:companyId/')
export class CatalogsController {
  constructor(
    private readonly catalogsService: CatalogsService,
    private readonly salaryLevelsCatalogService: SalaryLevelsCatalogService,
    private readonly patronalRecordsService: PatronalRecordsService,
    private readonly operatingUnitsService: OperatingUnitsService,
  ) { }

  // Obtiene un catálogo genérico
  @Get('catalogs/:nombre')
  @ApiParam({
    name: 'nombre',
    description: 'Nombre del catálogo a consultar',
    enum: ['roles', 'empresas', 'sites', 'modulos', 'areas', 'tipos-contratacion', 'modalidades', 'centro-costos', 'registros-patronales', 'tipos-ubicaciones', 'empleados'],
  })
  @ApiOperation({
    summary: 'Obtener catálogo genérico',
    description:
      'Retorna los registros activos del catálogo indicado en el path param. ' +
      'Valores aceptados: roles, empresas, sites, modulos, areas, tipos-contratacion, modalidades, centro-costos, registros-patronales, tipos-ubicaciones, empleados',
  })
  @ApiResponse({ status: 200, description: 'Lista de registros del catálogo.' })
  @ApiResponse({ status: 400, description: 'Catálogo no reconocido.' })
  getCatalog(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('nombre') nombre: string,
    @GetActiveUser() user: ActiveUserDto,
  ) {
    return this.catalogsService.getCatalog(user, companyId, nombre as CatalogKey);
  }

  // ==========================================
  // ENDPOINTS: Subservicio de niveles salariales
  // ==========================================

  // Obtiene todos los niveles salariales paginados
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

  // Obtiene un nivel salarial por id
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

  // Crea un nivel salarial
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

  // Actualiza un nivel salarial
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

  // Desactiva un nivel salarial
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

  // Reactiva un nivel salarial
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
  // ENDPOINTS: Subservicio de registros patronales
  // ==========================================

  // Obtiene todos los registros patronales paginados
  @Get('patronal-records')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all patronal records', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Patronal records obtained successfully' })
  @ApiResponse({ status: 404, description: 'Patronal records not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async getPatronalRecords(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    const querySearch = search || '';
    return this.patronalRecordsService.findAll(companyId, page, limit, querySearch, user);  
}

  // Obtiene un registro patronal por id
  @Get('patronal-records/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all patronal records', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Patronal records obtained successfully' })
  @ApiResponse({ status: 404, description: 'Patronal records not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async getPatronalRecordById(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.patronalRecordsService.findOne(companyId, id, user);   // <-- user agregado
}

  // Crea un registro patronal
  @Post('patronal-records')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create patronal record', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Patronal record created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async createPatronalRecord(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() createPatronalRecordDto: CreatePatronalRecordDto
  ) {
     return this.patronalRecordsService.create(companyId, createPatronalRecordDto, user);   
}

  // Actualiza un registro patronal
  @Put('patronal-records/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update patronal record', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Patronal record updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request: Invalid input data' })
  @ApiResponse({ status: 404, description: 'Patronal record not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async updatePatronalRecord(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePatronalRecordDto: UpdatePatronalRecordDto
  ) {
    return this.patronalRecordsService.update(companyId, id, updatePatronalRecordDto, user);
  }

  // Desactiva un registro patronal
  @Delete('patronal-records/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable patronal record', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Patronal record disabled successfully' })
  @ApiResponse({ status: 404, description: 'Patronal record not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async disablePatronalRecord(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @GetActiveUser() user: ActiveUserDto
  ) {
    return this.patronalRecordsService.changeStatus(companyId, id, false, user);
  }

  // Reactiva un registro patronal
  @Patch('patronal-records/:id/reactivate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reactivate patronal record', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Patronal record reactivated successfully' })
  @ApiResponse({ status: 404, description: 'Patronal record not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async reactivatePatronalRecord(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @GetActiveUser() user: ActiveUserDto
  ) {
    return this.patronalRecordsService.changeStatus(companyId, id, true, user);
  }

  // ==========================================
  // ENDPOINTS: Subservicio de unidades operativas
  // ==========================================

  @Get('operating-units')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all operating units', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Operating units obtained successfully' })
  @ApiResponse({ status: 404, description: 'Operating units not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async getOperatingUnits(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    const querySearch = search || '';
    return this.operatingUnitsService.findAll(companyId, page, limit, querySearch, user);
  }

  // Obtiene una unidad operativa por id
  @Get('operating-units/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener una unidad operativa por ID' })
  @ApiParam({ name: 'companyId', type: Number, description: 'ID de la empresa' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la unidad operativa' })
  @ApiResponse({ status: 200, description: 'Detalle de la unidad operativa obtenido exitosamente' })
  @ApiResponse({ status: 404, description: 'Unidad operativa no encontrada' })
  async getOperatingUnitById(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.operatingUnitsService.findById(companyId, id, user);
  }

  // Crea una unidad operativa
  @Post('operating-units')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear una nueva unidad operativa' })
  @ApiParam({ name: 'companyId', type: Number, description: 'ID de la empresa' })
  @ApiResponse({ status: 201, description: 'Unidad operativa creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  async createOperatingUnit(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() createDto: CreateOperatingUnitDto,
  ) {
    return this.operatingUnitsService.create(companyId, createDto, user);
  }

  // Actualiza una unidad operativa
  @Put('operating-units/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar una unidad operativa existente' })
  @ApiParam({ name: 'companyId', type: Number, description: 'ID de la empresa' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la unidad operativa' })
  @ApiResponse({ status: 200, description: 'Unidad operativa actualizada exitosamente' })
  @ApiResponse({ status: 404, description: 'Unidad operativa no encontrada' })
  async updateOperatingUnit(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateOperatingUnitDto,
  ) {
    return this.operatingUnitsService.update(companyId, id, updateDto, user);
  }

  // Desactivar unidad operativa (Soft Delete)
  @Delete('operating-units/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable operating unit', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiParam({ name: 'companyId', type: Number, description: 'ID de la empresa' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la unidad operativa' })
  @ApiResponse({ status: 200, description: 'Operating unit disabled successfully' })
  @ApiResponse({ status: 404, description: 'Operating unit not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async disableOperatingUnit(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.operatingUnitsService.changeStatus(companyId, id, false, user);
  }

  // Reactivar unidad operativa
  @Patch('operating-units/:id/reactivate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reactivate operating unit', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiParam({ name: 'companyId', type: Number, description: 'ID de la empresa' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la unidad operativa' })
  @ApiResponse({ status: 200, description: 'Operating unit reactivated successfully' })
  @ApiResponse({ status: 404, description: 'Operating unit not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async reactivateOperatingUnit(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.operatingUnitsService.changeStatus(companyId, id, true, user);
  }

}
