import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) { }

  @Post()
  create(@Body() createEmployeeDto: CreateEmployeeDto) {
    return this.employeesService.create(createEmployeeDto);
  }

  @Get()
  findAll() {
    return this.employeesService.findAll();
  }

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

  @Patch('/:employeeId')
  update(@Param('employeeId', ParseIntPipe) employeeId: number, @Body() updateEmployeeDto: UpdateEmployeeDto) {
    return this.employeesService.update(+employeeId, updateEmployeeDto);
  }

  @Delete('/:employeeId')
  remove(@Param('employeeId', ParseIntPipe) employeeId: number) {
    return this.employeesService.remove(+employeeId);
  }
}
