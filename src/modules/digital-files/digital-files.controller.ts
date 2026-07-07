import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DigitalFilesService } from './digital-files.service';
import { DocumentoRequeridoDto, ExpedienteResponseDto } from './dto/expediente-response.dto';

@ApiTags('Digital Files')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('companies/:companyId/digital-files')
export class DigitalFilesController {
  constructor(private readonly digitalFilesService: DigitalFilesService) {}

 
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

  
  @Get('documents-by-position/:positionId')
  @ApiOperation({
    summary: 'Get required documents by position',
    description: 'Get the catalog of required documents for a job position',
  })
  @ApiOkResponse({ description: 'Documents obtained successfully', type: [DocumentoRequeridoDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  getDocumentosPorPuesto(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('positionId', ParseIntPipe) positionId: number,
  ) {
    return this.digitalFilesService.getDocumentosPorPuesto(positionId);
  }
}