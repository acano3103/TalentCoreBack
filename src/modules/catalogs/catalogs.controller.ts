import { Body, Controller, DefaultValuePipe, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
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
import { ScheduleCatalogsService } from './sub-services/schedule-catalogs.service';
import { CreateScheduleCatalogDto } from './dto/create-schedule-catalog.dto';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExcelExportService } from 'src/common/services/excel-export.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Catalogs')
@Controller('companies/:companyId/')
export class CatalogsController {
  constructor(
    private readonly catalogsService: CatalogsService,
    private readonly salaryLevelsCatalogService: SalaryLevelsCatalogService,
    private readonly patronalRecordsService: PatronalRecordsService,
    private readonly operatingUnitsService: OperatingUnitsService,
    private readonly scheduleCatalogsService: ScheduleCatalogsService,
    private readonly excelExportService: ExcelExportService,
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
  @ApiOperation({ summary: 'Get all salary levels', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Salary levels obtained successfully' })
  @ApiResponse({ status: 404, description: 'Salary levels not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async findAllSalaryLevels(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    const querySearch = search || '';
    return this.salaryLevelsCatalogService.findAll(activeUser, companyId, page, limit, querySearch);
  }

  // Obtiene un nivel salarial por id
  @Get('salary-levels/:salaryLevelId')
  @ApiOperation({ summary: 'Get one salary level', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Salary level obtained successfully' })
  @ApiResponse({ status: 404, description: 'Salary level not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async findOne(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('salaryLevelId', ParseIntPipe) salaryLevelId: number,
  ) {
    return await this.salaryLevelsCatalogService.findOne(activeUser, companyId, salaryLevelId);
  }

  // Crea un nivel salarial
  @Post('salary-levels')
  @ApiOperation({ summary: 'Create salary level', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Salary level created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async create(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() createSalaryLevelsCatalogDto: CreateSalaryLevelsCatalogDto,
  ) {
    return await this.salaryLevelsCatalogService.create(activeUser, companyId, createSalaryLevelsCatalogDto);
  }

  // Actualiza un nivel salarial
  @Put('salary-levels/:salaryLevelId')
  @ApiOperation({ summary: 'Update salary level', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Salary level updated successfully' })
  @ApiResponse({ status: 404, description: 'Salary level not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async update(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('salaryLevelId', ParseIntPipe) salaryLevelId: number,
    @Body() updateSalaryLevelsCatalogDto: UpdateSalaryLevelsCatalogDto,
  ) {
    return await this.salaryLevelsCatalogService.update(activeUser, companyId, salaryLevelId, updateSalaryLevelsCatalogDto);
  }

  // Desactiva un nivel salarial
  @Delete('salary-levels/:salaryLevelId')
  @ApiOperation({ summary: 'Disable salary level', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Salary level disabled successfully' })
  @ApiResponse({ status: 404, description: 'Salary level not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async disable(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('salaryLevelId', ParseIntPipe) salaryLevelId: number,
  ) {
    return this.salaryLevelsCatalogService.changeStatus(activeUser, companyId, salaryLevelId, false);
  }

  // Reactiva un nivel salarial
  @Patch('salary-levels/:salaryLevelId/reactivate')
  @ApiOperation({ summary: 'Reactivate salary level', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Salary level reactivated successfully' })
  @ApiResponse({ status: 404, description: 'Salary level not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async reactivate(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('salaryLevelId', ParseIntPipe) salaryLevelId: number,
  ) {
    return this.salaryLevelsCatalogService.changeStatus(activeUser, companyId, salaryLevelId, true);
  }

  // ==========================================
  // ENDPOINTS: Subservicio de registros patronales
  // ==========================================

  // Obtiene todos los registros patronales paginados
  @Get('patronal-records')
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

  // Exporta a Excel todas las unidades operativas que cumplan los filtros (sin paginar)
  @Get('operating-units/export')
  @ApiOperation({ summary: 'Export operating units to Excel', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Excel file generated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async exportOperatingUnits(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('activo') activo?: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    const buffer = await this.operatingUnitsService.exportOperatingUnits(companyId, user, {
      search,
      activo,
      fechaDesde,
      fechaHasta,
    });
    this.excelExportService.send(res, buffer, 'Unidades_Operativas');
  }


  // Obtiene una unidad operativa por id
  @Get('operating-units/:id')
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

  // ==========================================
  // ENDPOINTS: Subservicio de catalogo de horarios
  // ==========================================

  // Obtiene todos los horarios paginados
  @Get('schedule-catalogs')
  @ApiOperation({ summary: 'Get all schedules', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Schedules obtained successfully' })
  @ApiResponse({ status: 404, description: 'Schedules not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async findAllSchedules(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    const querySearch = search || '';
    return this.scheduleCatalogsService.findAllSchedules(activeUser, page, limit, querySearch);
  }

  // Obtiene todos los catálogos de horarios sin paginar para selectores y asignaciones
  @Get('schedule-catalogs/all')
  @ApiOperation({ summary: 'Get all schedule catalogs unpaginated', description: "Obtiene todos los horarios activos para usar en assignaciones de turnos" })
  @ApiResponse({ status: 200, description: 'Catálogo completo de horarios obtenido exitosamente' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async findAllSchedulesUnpaginated(@GetActiveUser() activeUser: ActiveUserDto) {
    return this.scheduleCatalogsService.findAllSchedulesUnpaginated(activeUser);
  }

  // Descarga una plantilla para crear horarios masivamente
  @Get('schedule-catalogs/bulk/template')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download bulk upload Excel template for schedule catalogs', description: 'Generates and streams an Excel template with schedule names, days and hours for bulk schedule creation' })
  @ApiResponse({ status: 200, description: 'Template generated and downloaded successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async downloadBulkScheduleTemplate(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Res() res: Response,
  ) {
    const buffer = await this.scheduleCatalogsService.generateBulkTemplate(activeUser);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="Plantilla_Horarios_Catalogo.xlsx"',
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  // Crear un nuevo horario en el catálogo
  @Post('schedule-catalogs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new schedule catalog', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 201, description: 'Schedule catalog created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid data or schedule name already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async createSchedule(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Body() dto: CreateScheduleCatalogDto,
  ) {
    return this.scheduleCatalogsService.createSchedule(activeUser, dto);
  }

  // Procesa el archivo Excel de horarios cargado
  @Post('schedule-catalogs/bulk/upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload and process bulk schedule catalogs Excel file', description: 'Parses the uploaded Excel file, validates schedule names, duplicates days and times, creating schedules in bulk' })
  @ApiResponse({ status: 200, description: 'Bulk schedule file processed successfully' })
  @ApiResponse({ status: 400, description: 'No file uploaded or invalid file format' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async uploadBulkSchedules(
    @UploadedFile() file: Express.Multer.File,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return await this.scheduleCatalogsService.processBulkSchedules(file, activeUser);
  }

  // Actualizar un horario en el catálogo
  @Put('schedule-catalogs/:currentScheduleName')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a schedule catalog', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Schedule catalog updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid data or schedule name already exists' })
  @ApiResponse({ status: 404, description: 'Schedule catalog to update not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async updateSchedule(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('currentScheduleName') currentScheduleName: string,
    @Body() dto: CreateScheduleCatalogDto,
  ) {
    const decodedName = decodeURIComponent(currentScheduleName);
    return this.scheduleCatalogsService.updateSchedule(activeUser, decodedName, dto);
  }

}
