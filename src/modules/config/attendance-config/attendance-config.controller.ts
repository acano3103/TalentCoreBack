import { Body, Controller, Get, Param, ParseIntPipe, Put, Query, UseGuards } from '@nestjs/common';
import { AttendanceTrackingConfigService } from './attendance-config.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { UpdateAttendanceConfigDto } from './dto/update-attendance-config.dto';

@ApiTags('Attendance Config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/attendance-config')
export class AttendanceTrackingConfigController {
  constructor(private readonly attendanceTrackingConfigService: AttendanceTrackingConfigService) { }

  @Get()
  @ApiOperation({ summary: 'Config data for attendance tracking', description: 'Returns config data for attendance tracking' })
  @ApiResponse({ status: 200, description: 'Config data retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getDashboardMetrics(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.attendanceTrackingConfigService.getConfiguracionAsistencia(user.idTenant, companyId);
  }

  @Put()
  @ApiOperation({ summary: 'Update attendance tracking configuration', description: 'Updates or creates the configuration payload for attendance tracking' })
  @ApiResponse({ status: 200, description: 'Configuration updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request / Invalid Payload' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  updateConfig(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: UpdateAttendanceConfigDto,
  ) {
    return this.attendanceTrackingConfigService.updateConfiguracionAsistencia(user.idTenant, companyId, dto);
  }
}
