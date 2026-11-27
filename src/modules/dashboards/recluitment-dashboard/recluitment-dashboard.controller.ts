import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { RecruitmentDashboardQueryDto } from './dto/recruitment-dashboard-query.dto';
import { RecruitmentDashboardService } from './recluitment-dashboard.service';

@ApiTags('Recruitment Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/recruitment-dashboard')
export class RecruitmentDashboardController {
  constructor(private readonly dashboardService: RecruitmentDashboardService) { }

  @Get()
  @ApiOperation({
    summary: 'Recruitment dashboard',
    description:
      'Open vacancies, requisitions under review, candidate funnel, acquisition sources, time-to-fill, generated documents and breakdowns by area and site',
  })
  @ApiResponse({ status: 200, description: 'Metrics calculated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid filters' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  getMetrics(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: RecruitmentDashboardQueryDto,
  ) {
    return this.dashboardService.getMetrics(user, companyId, query);
  }
}