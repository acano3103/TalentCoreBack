import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { VacationsService } from './vacations.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CreateVacationRequestDto } from './dto/create-vacation-request.dto';

@ApiTags('Vacations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/incidents/vacations')
export class VacationsController {
  constructor(private readonly vacationsService: VacationsService) { }

  // Obtiene el balance de vacaciones de un empleado
  @Get('balance/:employeeId')
  @ApiOperation({ summary: 'Get employee vacation balance', description: 'Get an employee vacation balance and business policy constraints for a specific period.', })
  @ApiResponse({ status: 200, description: 'Employee vacation balance retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiResponse({ status: 404, description: 'Employee not found.' })
  getBalance(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.vacationsService.getEmployeeBalance(activeUser, companyId, employeeId);
  }

  // Crea una solicitud de vacaciones
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create vacation request', description: 'Registers a new vacation incident for the employee or their subordinate.', })
  @ApiResponse({ status: 201, description: 'Vacation request created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request. Validation or business rule errors.' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiResponse({ status: 404, description: 'Target or requester employee not found.' })
  create(
    @GetActiveUser() activeUser: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CreateVacationRequestDto,
  ) {
    return this.vacationsService.createVacationRequest(activeUser, companyId, dto);
  }
}