import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { SaveSalaryDto } from './dto/save-salary.dto';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) { }

  // Endpint para obtener un empleado por su id
  @Get('/:employeeId')
  @ApiOperation({ summary: 'Get employee by id', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Employee retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  findOne(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('companyId', ParseIntPipe) companyId: number
  ) {
    return this.employeesService.findOne(companyId, employeeId);
  }

  // Endpoint que registra el salario del empleado por primera vez
  @Post('/:employeeId/salary')
  @ApiOperation({ summary: 'Save employee salary for the first time', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Employee salary saved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  saveSalary(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() salaryData: SaveSalaryDto,
    @GetActiveUser() activeUser: ActiveUserDto
  ) {
    return this.employeesService.saveSalary(activeUser, companyId, employeeId, salaryData);
  }

  @Get()
  @ApiOperation({ summary: 'Get all employees enriched', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Employees retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  findAll(@Param('companyId', ParseIntPipe) companyId: number) {
    return this.employeesService.findAll(companyId);
  }

@Get('/completos/lista')
@ApiOperation({ summary: 'Get all employees with complete expediente', description: SWAGGER_AUTH_DESCRIPTION })
@ApiResponse({ status: 200, description: 'Employees retrieved successfully' })
@ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
findAllWithCompleteFile(@Param('companyId', ParseIntPipe) companyId: number) {
  return this.employeesService.findAllWithCompleteFile(companyId);
}
}
