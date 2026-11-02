import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { TrainingDashboardService } from './training-dashboard.service';

@ApiTags('Training Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/training-dashboard')
export class TrainingDashboardController {
  constructor(private readonly trainingDashboardService: TrainingDashboardService) { }

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
}
