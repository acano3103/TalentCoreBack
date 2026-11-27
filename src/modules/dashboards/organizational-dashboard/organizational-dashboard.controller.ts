import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { OrganizationalDashboardService } from './organizational-dashboard.service';
import { OrganizationalDashboardQueryDto } from './dto/organizational-dashboard.dto';

@ApiTags('Organizational Structure Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/organizational-dashboard')
export class OrganizationalDashboardController {
  constructor(private readonly dashboardService: OrganizationalDashboardService) { }

  @Get()
  @ApiOperation({ summary: 'Organizational structure dashboard', description: 'Headcount, positions, vacancies, turnover, budget and breakdowns by area, level, contract type and location' })
  @ApiResponse({ status: 200, description: 'Metrics calculated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid filters' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  getMetrics(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: OrganizationalDashboardQueryDto,
  ) {
    return this.dashboardService.getMetrics(user, companyId, query);
  }
}
