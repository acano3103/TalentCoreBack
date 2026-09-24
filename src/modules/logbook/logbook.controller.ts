import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { LogbookService } from './logbook.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@ApiTags('Logbook')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/logbook')
export class LogbookController {
  constructor(private readonly logbookService: LogbookService) { }

  // This endpoint returns all paginated logbooks for a company
  @Get()
  @ApiOperation({ summary: 'Get all logbooks', description: 'Returns the list of system logbooks for a company.' })
  @ApiResponse({ status: 200, description: 'List of logbooks successfully retrieved.' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  findAll(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('startDate') startDate?: string,
    @Query('search') search?: string,
    @Query('idSite') idSite?: string,
    @Query('idUnidadOperativa') idUnidadOperativa?: string,
  ) {
    return this.logbookService.findAll(user, companyId, page, limit, startDate, search, idSite, idUnidadOperativa);
  }
}
