import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { LogbookService } from './logbook.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { ExcelExportService } from 'src/common/services/excel-export.service';

@ApiTags('Logbook')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/logbook')
export class LogbookController {
  constructor(
    private readonly logbookService: LogbookService,
    private readonly excelExportService: ExcelExportService,
  ) { }

  // This endpoint returns all paginated logbooks for a company
  @Get()
  @ApiOperation({ summary: 'Get all logbooks', description: 'Returns the list of system logbooks for a company.' })
  @ApiResponse({ status: 200, description: 'List of logbooks successfully retrieved.' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  findAll(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('startDate') startDate?: string,
    @Query('search') search?: string,
    @Query('idSite') idSite?: string,
    @Query('idUnidadOperativa') idUnidadOperativa?: string,
    @Query('canal') canal?: string,
    @Query('incluirAnulados') incluirAnulados?: string,
  ) {
    return this.logbookService.findAll(
      user,
      companyId,
      page,
      limit,
      startDate,
      search,
      idSite,
      idUnidadOperativa,
      canal,
      incluirAnulados === 'true' || incluirAnulados === '1',
    );
  }

  // Exporta a Excel todos los registros que cumplan los filtros (sin paginar)
  @Get('export')
  @ApiOperation({ summary: 'Export logbook to Excel', description: 'Exports all logbook records matching the filters (no pagination)' })
  @ApiResponse({ status: 200, description: 'Excel file generated successfully' })
  async exportLogbook(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('idSite') idSite?: string,
    @Query('idUnidadOperativa') idUnidadOperativa?: string,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
    @Query('canal') canal?: string,
    @Query('incluirAnulados') incluirAnulados?: string,
  ) {
    const buffer = await this.logbookService.exportLogbook(user, companyId, {
      search,
      idSite,
      idUnidadOperativa,
      fechaDesde,
      fechaHasta,
      canal,
      incluirAnulados: incluirAnulados === 'true' || incluirAnulados === '1',
    });
    this.excelExportService.send(res, buffer, 'Bitacora_Registros');
  }

  // This endpoint returns logbook detail
  @Get(':logbookId')
  @ApiOperation({ summary: 'Get all logbooks', description: 'Returns the list of system logbooks for a company.' })
  @ApiResponse({ status: 200, description: 'List of logbooks successfully retrieved.' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  findOne(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('logbookId', ParseIntPipe) logbookId: number,
  ) {
    return this.logbookService.findOne(user, companyId, logbookId);
  }
}