import { Controller, Post, Get, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { InternalMovementsService } from './internal-movements.service';
import { CreateInternalMovementDto } from './dto/create-internal-movement.dto';
import { CreateBajaDto } from './dto/baja.dto';
import { EvaluateMovementDto } from './dto/evaluate-movement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/employees/:employeeId')
export class InternalMovementsController {
  constructor(private readonly internalMovementsService: InternalMovementsService) {}

  @Post('movements')
  @ApiOperation({ summary: 'Create internal movement (direct or request)', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 201, description: 'Movement created successfully' })
  create(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() createInternalMovementDto: CreateInternalMovementDto,
    @GetActiveUser() activeUser: ActiveUserDto
  ) {
    return this.internalMovementsService.create(activeUser, companyId, employeeId, createInternalMovementDto);
  }

  @Post('movements/request')
  @ApiOperation({ summary: 'Create internal movement request', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 201, description: 'Movement request created successfully' })
  createMovementRequest(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() createInternalMovementDto: CreateInternalMovementDto,
    @GetActiveUser() activeUser: ActiveUserDto
  ) {
    return this.internalMovementsService.createMovementRequest(activeUser, companyId, employeeId, createInternalMovementDto);
  }

  @Post('movements/:movementId/evaluate')
  @ApiOperation({ summary: 'Evaluate internal movement request (approve or reject)', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Movement evaluated successfully' })
  evaluateMovement(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('movementId', ParseIntPipe) movementId: number,
    @Body() evaluateMovementDto: EvaluateMovementDto,
    @GetActiveUser() activeUser: ActiveUserDto
  ) {
    return this.internalMovementsService.evaluateMovement(companyId, movementId, evaluateMovementDto.action, activeUser);
  }

  @Post('baja')
  @ApiOperation({ summary: 'Process employee termination (baja)', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 201, description: 'Employee termination processed successfully' })
  createBaja(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() createBajaDto: CreateBajaDto,
    @GetActiveUser() activeUser: ActiveUserDto
  ) {
    return this.internalMovementsService.createBaja(activeUser, companyId, employeeId, createBajaDto);
  }

  @Get('movements')
  @ApiOperation({ summary: 'Get movement history for employee', description: SWAGGER_AUTH_DESCRIPTION })
  findByEmployee(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.internalMovementsService.findByEmployee(companyId, employeeId);
  }
}

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/movements')
export class CompanyMovementsController {
  constructor(private readonly internalMovementsService: InternalMovementsService) {}

  @Get('requests')
  @ApiOperation({ summary: 'Get all movement requests for company', description: SWAGGER_AUTH_DESCRIPTION })
  getMovementRequests(@Param('companyId', ParseIntPipe) companyId: number) {
    return this.internalMovementsService.getMovementRequests(companyId);
  }

  @Get('requests/pending-for-me')
  @ApiOperation({ summary: 'Get movement requests pending approval for active user', description: SWAGGER_AUTH_DESCRIPTION })
  getPendingForMe(
    @Param('companyId', ParseIntPipe) companyId: number,
    @GetActiveUser() activeUser: ActiveUserDto
  ) {
    return this.internalMovementsService.getPendingRequestsForUser(companyId, activeUser);
  }
}

