import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MobileJwtAuthGuard } from '../mobile-auth/guards/mobile-jwt-auth.guard';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { QueryIncidentsDto } from 'src/modules/incidents/dto/query-incidents.dto';
import { IncidentsService } from 'src/modules/incidents/incidents.service';
import { GetIncidentRequestDetailDto } from 'src/modules/incidents/dto/get-incident-request-detail.dto';
import { VacationsService } from 'src/modules/incidents/vacations/vacations.service';
import { CreateVacationRequestDto } from 'src/modules/incidents/vacations/dto/create-vacation-request.dto';
import { PermissionsService } from 'src/modules/incidents/permissions/permissions.service';
import { IncapacitiesService } from 'src/modules/incidents/incapacities/incapacities.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreatePermissionDto } from 'src/modules/incidents/permissions/dto/create-permission.dto';
import { CreateIncapacityDto } from 'src/modules/incidents/incapacities/dto/create-incapacity.dto';

@ApiTags('Mobile Incidents')
@ApiBearerAuth()
@UseGuards(MobileJwtAuthGuard)
@Controller('companies/:companyId/mobile/incidents')
export class MobileIncidentsController {
  constructor(
    private readonly incidentsService: IncidentsService,
    private readonly vacationsService: VacationsService,
    private readonly permissionsService: PermissionsService,
    private readonly incapacitiesService: IncapacitiesService,
  ) { }


  // ==================== INCIDENTS ====================

  // Obtiene todas las incidencias que el empleado solicito
  @Get('requested')
  @ApiOperation({ summary: 'Get all incidents requested', description: 'Get all incidents of the employee.', })
  @ApiResponse({ status: 200, description: 'All incidents retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  findAllRequested(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: QueryIncidentsDto,
  ) {
    return this.incidentsService.findAllRequested(activeUser, companyId, query);
  }

  // Obtiene el detalle de una incidencia con su flujo de aprobacion
  @Get('requested/detail')
  @ApiOperation({ summary: 'Get requested incident detail', description: 'Gets an incident request and its approval flow without requiring the current user to be its assigned approver.', })
  @ApiResponse({ status: 200, description: 'Incident request detail retrieved successfully', })
  @ApiResponse({ status: 400, description: 'Invalid request origin.', })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.', })
  @ApiResponse({ status: 404, description: 'The incident request does not exist.', })
  getIncidentRequestedDetail(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: GetIncidentRequestDetailDto,
  ) {
    return this.incidentsService.getIncidentRequestedDetail(activeUser, companyId, query);
  }

  // ==================== VACATIONS ====================

  // Obtiene el balance de vacaciones de un empleado
  @Get('vacations/balance/:employeeId')
  @ApiOperation({ summary: 'Get employee vacation balance', description: 'Get an employee vacation balance and business policy constraints for a specific period.', })
  @ApiResponse({ status: 200, description: 'Employee vacation balance retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiResponse({ status: 404, description: 'Employee not found.' })
  getBalance(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.vacationsService.getEmployeeBalance(activeUser, companyId, employeeId);
  }

  // Crea una solicitud de vacaciones
  @Post('vacations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create vacation request', description: 'Registers a new vacation incident for the employee or their subordinate.', })
  @ApiResponse({ status: 201, description: 'Vacation request created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request. Validation or business rule errors.' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiResponse({ status: 404, description: 'Target or requester employee not found.' })
  create(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CreateVacationRequestDto,
  ) {
    return this.vacationsService.createVacationRequest(activeUser, companyId, dto);
  }

  // ==================== PERMISSIONS ====================

  // Obtiene el balance de permisos de un empleado
  @Get('permissions/balance/:employeeId')
  @ApiOperation({ summary: 'Get employee permissions balance', description: 'Get an employee permissions balance.' })
  @ApiResponse({ status: 200, description: 'Employee permissions balance retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Employee not found.' })
  getEmployeesPermissionBalance(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ): Promise<any> {
    return this.permissionsService.getEmployeeBalance(activeUser, companyId, employeeId);
  }

  // Crear solicitud de permiso
  @Post('permissions')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('archivo'))
  @ApiOperation({ summary: 'Create permission request', description: 'Registers a new permission incident for the employee or their subordinate.' })
  @ApiResponse({ status: 201, description: 'Permission request created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request. Validation or business rule errors.' })
  @ApiResponse({ status: 404, description: 'Target or requester employee not found.' })
  createPermission(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CreatePermissionDto,
    @UploadedFile() archivo?: Express.Multer.File,
  ): Promise<any> {
    return this.permissionsService.createPermission(activeUser, companyId, dto, archivo);
  }

  // Subir comprobante de un permiso
  @Patch('permissions/:idSolicitud/attachment')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 10 * 1024 * 1024, } }))
  @ApiOperation({ summary: 'Upload permission attachment', description: 'Uploads a proof document to an existing permission request.' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Attachment uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or upload deadline expired.' })
  @ApiResponse({ status: 404, description: 'Permission request not found.' })
  async uploadPermissionAttachment(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('idSolicitud', ParseIntPipe) idSolicitud: number,
    @UploadedFile() archivo?: Express.Multer.File,
  ) {
    return this.permissionsService.uploadPermissionAttachment(activeUser, companyId, idSolicitud, archivo);
  }

  // ==================== INCAPACITIES ====================

  // Crear solicitud de incapacidad
  @Post('incapacities')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('archivo'))
  @ApiOperation({ summary: 'Create incapacity request', description: 'Registers a new incapacity incident for the employee or their subordinate.' })
  @ApiResponse({ status: 201, description: 'Incapacity request created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request. Validation or business rule errors.' })
  @ApiResponse({ status: 404, description: 'Target or requester employee not found.' })
  createIncapacity(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CreateIncapacityDto,
    @UploadedFile() archivo?: Express.Multer.File,
  ): Promise<any> {
    return this.incapacitiesService.createIncapacity(activeUser, companyId, dto, archivo);
  }
}
