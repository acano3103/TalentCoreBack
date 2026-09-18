import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@ApiTags('Attendance Config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) { }

  @Get('employee/:employeeId')
  @ApiOperation({ summary: 'Get user attendance', description: 'Returns user attendance' })
  @ApiResponse({ status: 200, description: 'User attendance retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getUserAttendance(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.attendanceService.getUserAttendance(user, companyId, employeeId);
  }
}
