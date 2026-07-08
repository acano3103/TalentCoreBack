import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOkResponse, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DigitalFilesService } from './digital-files.service';
import { DocumentoRequeridoDto, ExpedienteResponseDto } from './dto/expediente-response.dto';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@ApiTags('Digital Files')
@ApiBearerAuth()
@Controller('companies/:companyId/digital-files')
export class DigitalFilesController {
  constructor(private readonly digitalFilesService: DigitalFilesService) { }

  // Endpoint para obtener todos los empleados activos con un expediente digital
  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({
    summary: 'List employee digital files',
    description: 'Get a paginated list of employees with their expediente status',
  })
  @ApiResponse({ status: 200, description: 'List of employees for a company' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name or RFC' })
  listExpedientes(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.digitalFilesService.listExpedientes(companyId, page, limit, search || '');
  }

  // Endpoint para obtener el expediente digital de un empleado especifico
  @UseGuards(JwtAuthGuard)
  @Get(':employeeId')
  @ApiOperation({
    summary: 'Get employee digital file',
    description:
      'Get the full expediente of an employee: required documents, uploaded documents, personal info and catalogs',
  })
  @ApiOkResponse({ description: 'Expediente obtained successfully', type: ExpedienteResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiResponse({ status: 403, description: 'Employee does not belong to this company' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  getExpediente(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.digitalFilesService.getExpediente(companyId, employeeId);
  }

  // Endpoint publico para que el candidato pueda subir sus documentos
  @Get(':token/public')
  @ApiOperation({
    summary: 'Initialize expediente',
    description: 'Initialize expediente for a candidate',
  })
  @ApiOkResponse({ description: 'Expediente initialized successfully', type: ExpedienteResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiResponse({ status: 403, description: 'Employee does not belong to this company' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  initExpediente(@Param('token') token: string) {
    return this.digitalFilesService.initExpediente(token);
  }

  // Endpoint publico para obtener los documentos de un empleado
  @Get('documents/:employeeId/public')
  @ApiOperation({
    summary: 'Get employee documents',
    description: 'Get the documents of an employee',
  })
  @ApiOkResponse({ description: 'Documents obtained successfully', type: [DocumentoRequeridoDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  getDocumentosEmpleado(@Param('employeeId', ParseIntPipe) employeeId: number) {
    return this.digitalFilesService.getCompanyDocuments(employeeId);
  }

  // Endpoint para obtener los documentos requeridos por puesto
  @UseGuards(JwtAuthGuard)
  @Get('documents-by-position/:positionId')
  @ApiOperation({
    summary: 'Get required documents by position',
    description: 'Get the catalog of required documents for a job position',
  })
  @ApiOkResponse({ description: 'Documents obtained successfully', type: [DocumentoRequeridoDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  getDocumentsByPosition(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('positionId', ParseIntPipe) positionId: number,
  ) {
    return this.digitalFilesService.getDocumentsByPosition(positionId);
  }

  // // Endpoint para registrar un nuevo empleado y subir sus documentos en una sola petición
  // @UseGuards(JwtAuthGuard)
  // @Post('employee')
  // @UseInterceptors(AnyFilesInterceptor())
  // @ApiConsumes('multipart/form-data')
  // @ApiOperation({
  //   summary: 'Registra un nuevo empleado y sube sus documentos en una sola petición',
  //   description: 'Recibe multipart/form-data y delega todo el procesamiento, parseo y validaciones al servicio.'
  // })
  // @ApiResponse({ status: 200, description: 'Empleado registrado correctamente' })
  // @ApiResponse({ status: 400, description: 'Datos inválidos o faltantes' })
  // @ApiResponse({ status: 422, description: 'Documentos rechazados por Nubarium' })
  // @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  // async insertEmployeeWithFiles(
  //   @Body('empleado_json') empleadoJsonRaw: string,
  //   @Body('documento_map') documentoMapRaw: string,
  //   @Body('id_campania') idCampania: string,
  //   @UploadedFiles() files: Array<Express.Multer.File>,
  //   @GetActiveUser() activeUser: ActiveUserDto
  // ) {
  //   return await this.digitalFilesService.insertEmployeeWithFiles(empleadoJsonRaw, documentoMapRaw, idCampania, files, activeUser);
  // }
}