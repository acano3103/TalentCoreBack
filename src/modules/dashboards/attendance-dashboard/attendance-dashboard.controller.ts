import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { AttendanceDashboardService } from './attendance-dashboard.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';

@ApiTags('Attendance Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/attendance-dashboard')
export class AttendanceDashboardController {
  constructor(private readonly attendanceDashboardService: AttendanceDashboardService) { }

  @Get()
  @ApiOperation({ summary: 'Integral metrics for attendance dashboard', description: 'Returns integral metrics for attendance dashboard' })
  @ApiResponse({ status: 200, description: 'Metrics calculated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getDashboardMetrics(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('date') date?: string,
    @Query('idSite') idSite?: string,
    @Query('idUnidadOperativa') idUnidadOperativa?: string,
  ) {
    return this.attendanceDashboardService.getMetrics(user, companyId, date, idSite, idUnidadOperativa);
  }
}
