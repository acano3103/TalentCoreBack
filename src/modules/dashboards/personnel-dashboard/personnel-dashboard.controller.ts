import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { PersonnelDashboardService } from './personnel-dashboard.service';
import { PersonnelDashboardQueryDto } from './dto/personnel-dashboard-query.dto';

@ApiTags('Personnel Administration Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/personnel-dashboard')
export class PersonnelDashboardController {
  constructor(private readonly dashboardService: PersonnelDashboardService) { }

  @Get()
  @ApiOperation({ summary: 'Personnel administration dashboard', description: 'Active/inactive headcount, 30-day hires, internal movements, incident requests, monthly hires vs exits trend and breakdown by area' })
  @ApiResponse({ status: 200, description: 'Metrics calculated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid filters' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  getMetrics(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: PersonnelDashboardQueryDto,
  ) {
    return this.dashboardService.getMetrics(user, companyId, query);
  }
}