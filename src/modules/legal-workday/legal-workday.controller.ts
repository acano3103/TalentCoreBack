import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { LegalWorkdayService } from './legal-workday.service';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { ToggleLegalWorkDayDto } from './dto/toggle-legal-work-day.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/legal-workday')
export class LegalWorkdayController {
  constructor(private readonly legalWorkdayService: LegalWorkdayService) { }

  @Get()
  @ApiOperation({ summary: 'Get legal workday status', description: 'Returns if the gradual reduction transition from 48 to 40 hours is active and the list of thresholds by year (2026-2030).', })
  @ApiParam({ name: 'companyId', type: Number, description: 'ID of the company' })
  @ApiResponse({ status: 200, description: 'Legal workday status successfully retrieved.' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getStatus(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.legalWorkdayService.getStatus(user, companyId);
  }

  @Post('toggle')
  @ApiOperation({ summary: 'Toggle legal workday', description: 'Enables or disables the gradual reduction transition from 48 to 40 hours by inserting the official values if they do not exist.' })
  @ApiParam({ name: 'companyId', type: Number, description: 'ID of the company' })
  @ApiResponse({ status: 200, description: 'Legal workday status successfully toggled.' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  toggleReform(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: ToggleLegalWorkDayDto,
  ) {
    return this.legalWorkdayService.toggleReform(user, companyId, dto);
  }
}