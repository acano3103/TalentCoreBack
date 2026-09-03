import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DigitalFilesService } from './digital-files.service';
import { DocumentoRequeridoDto, ExpedienteResponseDto } from './dto/expediente-response.dto';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { UpdateExpedienteStatusDto } from './dto/update-status.dto';
import { UpdateDocumentStatusDto } from './dto/update-document-status.dto';
import { Res } from '@nestjs/common';
import { Response } from 'express';

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
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.digitalFilesService.listExpedientes(companyId, page, limit, search || '', activeUser);
  }

  // Endpoint para obtener el catálogo de estatus de documento
  @UseGuards(JwtAuthGuard)
  @Get('document-status-catalog')
  @ApiOperation({
    summary: 'Get document status catalog',
    description: 'Get the catalog of possible document statuses',
  })
  @ApiResponse({ status: 200, description: 'Catalog obtained successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  getDocumentStatusCatalog(@Param('companyId', ParseIntPipe) companyId: number) {
    return this.digitalFilesService.getDocumentStatusCatalog();
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
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.digitalFilesService.getExpediente(companyId, employeeId, activeUser);
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



  // Endpoint para registrar un nuevo empleado y subir sus documentos en una sola petición
  @UseGuards(JwtAuthGuard)
  @Post('employee')
  @UseInterceptors(AnyFilesInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Registra un nuevo empleado y sube sus documentos en una sola petición',
    description: 'Recibe multipart/form-data y delega todo el procesamiento, parseo y validaciones al servicio.'
  })
  @ApiParam({ name: 'companyId', type: Number })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        empleado_json: { type: 'string', description: 'JSON con los datos del empleado' },
        documento_map: { type: 'string', description: 'JSON: nombre de campo -> idDocumento' },
        id_campania: { type: 'string' },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })

  @ApiResponse({ status: 200, description: 'Empleado registrado correctamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o faltantes' })
  @ApiResponse({ status: 422, description: 'Documentos rechazados por Nubarium' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })

  async insertEmployeeWithFiles(
    @Body('empleado_json') empleadoJsonRaw: string,
    @Body('documento_map') documentoMapRaw: string,
    @Body('id_campania') idCampania: string,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @GetActiveUser() activeUser: ActiveUserDto
  ) {
    return await this.digitalFilesService.insertEmployeeWithFiles(empleadoJsonRaw, documentoMapRaw, idCampania, files, activeUser);
  }


  // Endpoint público para que el candidato guarde su información y documentos (sin sesión, valida el token)
  @Post(':token/public')
  @UseInterceptors(AnyFilesInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Guarda la información y documentos del candidato usando el token público',
    description: 'Verifica el token del enlace, resuelve el empleado y delega el procesamiento al mismo flujo que el endpoint privado.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        empleado_json: { type: 'string', description: 'JSON con los datos del empleado' },
        documento_map: { type: 'string', description: 'JSON: nombre de campo -> idDocumento' },
        id_campania: { type: 'string' },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Información y documentos guardados correctamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o faltantes' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  @ApiResponse({ status: 422, description: 'Documentos rechazados por Nubarium' })
  async insertEmployeeWithFilesPublic(
    @Param('token') token: string,
    @Body('empleado_json') empleadoJsonRaw: string,
    @Body('documento_map') documentoMapRaw: string,
    @Body('id_campania') idCampania: string,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    return await this.digitalFilesService.insertEmployeeWithFilesPublic(
      token,
      empleadoJsonRaw,
      documentoMapRaw,
      idCampania,
      files,
    );
  }

  // Endpoint para dar de alta un nuevo expediente/empleado directo y enviarle el link de documentación
  @UseGuards(JwtAuthGuard)
  @Post('employee-link')
  @UseInterceptors(AnyFilesInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Crea un nuevo expediente y envía el link de documentación al empleado',
    description: 'Recibe multipart/form-data con los datos del expediente y, opcionalmente, documentos de la empresa para adjuntar en el correo.',
  })
  @ApiParam({ name: 'companyId', type: Number })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        expediente_json: { type: 'string', description: 'JSON con los datos del expediente' },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Expediente creado y enlace enviado correctamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o faltantes' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  async createExpedienteAndLink(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body('expediente_json') expedienteJsonRaw: string,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return await this.digitalFilesService.createExpedienteAndLink(
      expedienteJsonRaw,
      files,
      activeUser,
      companyId,
    );
  }

  // Endpoint para obtener el estatus actual, catálogo y el historial de cambios
  @UseGuards(JwtAuthGuard)
  @Get(':employeeId/status-history')
  @ApiOperation({
    summary: 'Get expediente status history',
    description: 'Get current status, status catalog, and change history for an employee expediente',
  })
  @ApiResponse({ status: 200, description: 'Status history obtained successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiResponse({ status: 404, description: 'Expediente not found' })
  getStatusHistory(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
   return this.digitalFilesService.getStatusHistory(employeeId, activeUser);  
}

  // Endpoint para actualizar el estatus del expediente
  @UseGuards(JwtAuthGuard)
  @Post(':employeeId/status')
  @ApiOperation({
    summary: 'Update expediente status',
    description: 'Change the status of an employee expediente and register the change in history',
  })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiResponse({ status: 404, description: 'Expediente not found' })
  updateExpedienteStatus(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: UpdateExpedienteStatusDto,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.digitalFilesService.updateExpedienteStatus(
      employeeId,
      dto.nuevoEstatus,
      dto.comentario || '',
      activeUser,
    );
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

  // Endpoint para actualizar el estatus de un documento individual
  @UseGuards(JwtAuthGuard)
  @Post('documents/:idDocumentoEmpleado/status')
  @ApiOperation({
    summary: 'Update individual document status',
    description: 'Change the status of a specific employee document and register the change in history',
  })
  @ApiResponse({ status: 200, description: 'Document status updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  updateDocumentStatus(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('idDocumentoEmpleado', ParseIntPipe) idDocumentoEmpleado: number,
    @Body() dto: UpdateDocumentStatusDto,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.digitalFilesService.updateDocumentStatus(
      idDocumentoEmpleado,
      dto.nuevoEstatus,
      dto.comentario || '',
      activeUser, 
    );
  }

  // Endpoint para notificar al empleado sobre sus documentos rechazados (botón manual del front)
  @UseGuards(JwtAuthGuard)
  @Post(':employeeId/notify-rejected')
  @ApiOperation({
    summary: 'Notify rejected documents',
    description: 'Sends a single email to the employee listing all currently rejected documents.',
  })
  @ApiResponse({ status: 200, description: 'Notification sent successfully' })
  @ApiResponse({ status: 400, description: 'Employee has no rejected documents or no email registered' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  notifyRejectedDocuments(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.digitalFilesService.notifyRejectedDocuments(employeeId);
  }

   // Endpoint para regenerar el link de acceso y reenviar el correo (cuando el link original ya expiró)
  @UseGuards(JwtAuthGuard)
  @Post(':employeeId/resend-credentials')
  @ApiOperation({
    summary: 'Resend access credentials',
    description: 'Regenerates the upload link (fresh JWT) and resends the documentation email to the employee.',
  })
  @ApiResponse({ status: 200, description: 'Credentials resent successfully' })
  @ApiResponse({ status: 400, description: 'Employee has no email registered' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  resendCredentials(
    @GetActiveUser() activeUser: ActiveUserDto, 
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
     return this.digitalFilesService.resendCredentials(employeeId, activeUser);
  }

  
// Endpoint para notificar al empleado sobre documentos por vencer/vencidos (botón manual del front)
@UseGuards(JwtAuthGuard)
@Post(':employeeId/notify-expiring')
@ApiOperation({
  summary: 'Notify expiring documents',
  description: 'Sends a single email to the employee listing documents that are expiring soon or already expired.',
})
@ApiResponse({ status: 200, description: 'Notification sent successfully' })
@ApiResponse({ status: 400, description: 'Employee has no expiring documents or no email registered' })
@ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
@ApiResponse({ status: 404, description: 'Employee not found' })
notifyExpiringDocuments(
  @Param('companyId', ParseIntPipe) companyId: number,
  @Param('employeeId', ParseIntPipe) employeeId: number,
) {
  return this.digitalFilesService.notifyExpiringDocuments(employeeId);
}

  // Endpoint para obtener el historial de descargas del expediente
  @UseGuards(JwtAuthGuard)
  @Get(':employeeId/download-history')
  @ApiOperation({
    summary: 'Get expediente download history',
    description: 'Get the history of ZIP downloads for an employee expediente',
  })
  @ApiResponse({ status: 200, description: 'Download history obtained successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  getDownloadHistory(
    @GetActiveUser() activeUser: ActiveUserDto, 
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
     return this.digitalFilesService.getDownloadHistory(employeeId, activeUser); 
  }

  // Endpoint para descargar el expediente completo como ZIP
  // Endpoint para descargar el expediente completo como ZIP
  @UseGuards(JwtAuthGuard)
  @Post(':employeeId/download-zip')
  @ApiOperation({
    summary: 'Download expediente ZIP',
    description: 'Generate and download a ZIP with all documents of an employee. Only allowed if expediente is complete.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Motivo de la descarga' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'ZIP file generated successfully' })
  @ApiResponse({ status: 400, description: 'Missing motivo' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiResponse({ status: 403, description: 'Expediente is not complete yet' })
  @ApiResponse({ status: 404, description: 'No documents found' })
  async downloadExpedienteZip(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body('motivo') motivo: string,
    @GetActiveUser() activeUser: ActiveUserDto,
    @Res() res: Response,
  ) {
    const buffer = await this.digitalFilesService.downloadExpedienteZip(
      employeeId,
      motivo,
      activeUser,
    );

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="expediente_${employeeId}.zip"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  
}


