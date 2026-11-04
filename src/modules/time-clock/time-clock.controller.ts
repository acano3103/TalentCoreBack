import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { TimeClockService } from './time-clock.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { RegisterTimeClockDto } from './dto/register-time-clock.dto';
import { Request } from 'express';

@ApiTags('Time Clock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/time-clock')
export class TimeClockController {
  constructor(private readonly timeClockService: TimeClockService) { }

  // Obtiene el status actual del empleado que hace la petición para mostrar la acción en el reloj checador
  @Get('status')
  @ApiOperation({ summary: 'Get current employee attendance status', description: 'Obtains the current employee workday and determines the next available attendance action.' })
  @ApiResponse({ status: 200, description: 'Attendance status obtained successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiResponse({ status: 404, description: 'No active employee associated with this user.' })
  @ApiResponse({ status: 400, description: 'Invalid company ID.' })
  findStatus(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.timeClockService.findStatus(user, companyId);
  }

  // Registra una acción desde el reloj checador web.
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register employee attendance from web', description: 'Registers an attendance action for an active employee whose work modality is REMOTO.' })
  @ApiResponse({ status: 200, description: 'Attendance registered successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid attendance action or employee schedule.' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiResponse({ status: 404, description: 'No active employee associated with this user.' })
  @ApiResponse({ status: 422, description: 'Attendance transition is not allowed.' })
  async register(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: RegisterTimeClockDto,
    @Req() request: Request,
  ) {
    return this.timeClockService.register(user, companyId, dto, request);
  }
}
