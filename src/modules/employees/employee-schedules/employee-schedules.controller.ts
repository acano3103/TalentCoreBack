import { Body, Controller, Delete, Get, Param, ParseIntPipe, Put, Query, UseGuards } from '@nestjs/common';
import { EmployeeSchedulesService } from './employee-schedules.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { SaveEmployeeCalendarDayDto } from './dto/save-employee-calendar-day.dto';

@ApiTags('Employees Schedules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/employees/schedules')
export class EmployeeSchedulesController {
  constructor(private readonly employeeSchedulesService: EmployeeSchedulesService) { }

  // Obtiene los horarios semanales y las excepciones de un mes, con paginación y filtros para el calendario de empleados.
  @Get('all')
  @ApiOperation({ summary: 'Get employees monthly schedules', description: 'Returns paginated employees with their weekly base schedules and custom monthly schedule overrides.' })
  @ApiResponse({ status: 200, description: 'Monthly schedules retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getEmployeesMonthlySchedules(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('search') search?: string,
    @Query('idSite') idSite?: string,
    @Query('idUnidadOperativa') idUnidadOperativa?: string,
    @Query('idArea') idArea?: string,
  ) {
    return this.employeeSchedulesService.findEmployeesMonthlySchedules(activeUser, companyId, { page: page ? Number(page) : 1, limit: limit ? Number(limit) : 25, month: month ? Number(month) : undefined, year: year ? Number(year) : undefined, search: search || '', idSite, idUnidadOperativa, idArea });
  }

  // Obtiene los horarios en forma de calendario de un empleado especifico
  @Get(':employeeId/:date')
  @ApiOperation({ summary: 'Get employee custom schedule for a specific date', description: 'Returns employees custom schedule for a specific date.on: ' })
  @ApiResponse({ status: 200, description: 'Custom schedule retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  findCustomDay(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('date') date: string,
  ) {
    return this.employeeSchedulesService.findCustomDay(activeUser, companyId, employeeId, date);
  }

  // Crea una programación especifica en el calendario del empleado
  @Put(':employeeId/:date')
  @ApiOperation({ summary: 'Create or update employee custom schedule', description: 'Creates or replaces the custom schedule for a specific employee and date.' })
  @ApiResponse({ status: 200, description: 'Custom schedule saved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid schedule data' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  saveCustomDay(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('date') date: string,
    @Body() dto: SaveEmployeeCalendarDayDto,
  ) {
    return this.employeeSchedulesService.saveCustomDay(activeUser, companyId, employeeId, date, dto);
  }

  // Elimina una programación especifica en el calendario del empleado
  @Delete(':employeeId/:date')
  @ApiOperation({ summary: 'Delete employee custom schedule', description: 'Deletes a custom date override so the employee returns to the weekly schedule for that date.' })
  @ApiResponse({ status: 200, description: 'Custom schedule deleted successfully' })
  @ApiResponse({ status: 404, description: 'Custom schedule not found' })
  deleteCustomDay(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('date') date: string,
  ) {
    return this.employeeSchedulesService.deleteCustomDay(activeUser, companyId, employeeId, date);
  }
}