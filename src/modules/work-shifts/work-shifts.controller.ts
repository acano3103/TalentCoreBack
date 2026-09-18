import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { WorkShiftsService } from './work-shifts.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Work Shifts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/work-shifts')
export class WorkShiftsController {
  constructor(private readonly workShiftsService: WorkShiftsService) { }

  // This endpoint returns all paginated work shifts for a company


  @Get('mine')
  @ApiOperation({ summary: 'Get my work shifts', description: 'Returns the current week work shift for the logged-in employee.' })
  @ApiResponse({ status: 200, description: 'Weekly work shift data for the logged-in employee.' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findMine(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('startDate') startDate?: string,
  ) {
    return this.workShiftsService.findMine(user, companyId, startDate);
  }


  @Get()
  @ApiOperation({ summary: 'Get all work shifts', description: 'Returns the list of system work shifts for a company.' })
  @ApiResponse({ status: 200, description: 'List of work shifts successfully retrieved.' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  findAll(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('startDate') startDate?: string,
    @Query('search') search?: string,
  ) {
    return this.workShiftsService.findAll(user, companyId, page, limit, startDate, search);
  }
}
