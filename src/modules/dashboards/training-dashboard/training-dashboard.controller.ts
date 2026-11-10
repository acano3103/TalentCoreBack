import { Controller, Get, Param, ParseIntPipe, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { TrainingDashboardService } from './training-dashboard.service';
import { TrainingParticipantsService } from './training-participants.service';
import { ExcelExportService } from 'src/common/services/excel-export.service';
import { TrainingParticipantsFiltersDto, TrainingParticipantsQueryDto } from './dto/training-participants.dto';

@ApiTags('Training Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/training-dashboard')
export class TrainingDashboardController {
  constructor(
    private readonly trainingDashboardService: TrainingDashboardService,
    private readonly trainingParticipantsService: TrainingParticipantsService,
    private readonly excelExportService: ExcelExportService,
  ) { }

  // Endpoint con todas las métricas del tablero de capacitación (indicadores, embudo, tendencia, desgloses y alertas)
  @Get()
  @ApiOperation({ summary: 'Training dashboard metrics', description: 'Returns KPIs (with the previous period), funnel, monthly trend, breakdowns by modality, area and course, and alerts' })
  @ApiQuery({ name: 'desde', required: false, description: 'YYYY-MM-DD (default: January 1st of the current year)' })
  @ApiQuery({ name: 'hasta', required: false, description: 'YYYY-MM-DD (default: today)' })
  @ApiQuery({ name: 'idCurso', required: false })
  @ApiQuery({ name: 'idArea', required: false, description: "Employee's area (from the position)" })
  @ApiQuery({ name: 'modalidad', required: false, enum: ['presencial', 'online_sincrono', 'online_asincrono'] })
  @ApiResponse({ status: 200, description: 'Metrics calculated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid filters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getDashboardMetrics(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('idCurso') idCurso?: string,
    @Query('idArea') idArea?: string,
    @Query('modalidad') modalidad?: string,
  ) {
    return this.trainingDashboardService.getMetrics(user, companyId, { desde, hasta, idCurso, idArea, modalidad });
  }

  // Reporte de participantes: una fila por inscripción, paginado y ordenado en el servidor
  @Get('participants')
  @ApiOperation({ summary: 'Training participants report', description: 'Same filters as the dashboard plus status and search; paginated and sorted' })
  @ApiResponse({ status: 200, description: 'Participants obtained successfully' })
  @ApiResponse({ status: 400, description: 'Invalid filters' })
  getParticipants(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: TrainingParticipantsQueryDto,
  ) {
    return this.trainingParticipantsService.list(user, companyId, query);
  }

  // Historial de la persona de esa inscripción: datos, resumen y todos sus cursos
  @Get('participants/:idParticipante/history')
  @ApiOperation({ summary: 'Training history of the participant (all courses of the employee)' })
  @ApiResponse({ status: 200, description: 'History obtained successfully' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  getParticipantHistory(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('idParticipante', ParseIntPipe) idParticipante: number,
  ) {
    return this.trainingParticipantsService.history(user, companyId, idParticipante);
  }

  // Exporta a Excel todos los participantes que cumplan los filtros (sin paginar)
  @Get('participants/export')
  @ApiOperation({ summary: 'Export training participants to Excel' })
  @ApiResponse({ status: 200, description: 'Excel file generated successfully' })
  async exportParticipants(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: TrainingParticipantsFiltersDto,
    @Res() res: Response,
  ) {
    const buffer = await this.trainingParticipantsService.export(user, companyId, query);
    this.excelExportService.send(res, buffer, 'Participantes_Capacitacion');
  }
}
