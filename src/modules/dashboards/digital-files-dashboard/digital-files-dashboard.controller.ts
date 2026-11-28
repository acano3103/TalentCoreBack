import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { DigitalFileDashboardQueryDto } from './dto/digital-file-dashboard-query.dto';
import { DigitalFileDashboardService } from './digital-files-dashboard.service';

@ApiTags('Digital File Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/digital-file-dashboard')
export class DigitalFileDashboardController {
  constructor(private readonly dashboardService: DigitalFileDashboardService) { }

  @Get()
  @ApiOperation({ summary: 'Digital file dashboard', description: 'Active employees digital file completion, contract signing status, document validity states, breakdown by area/document type and expiring/missing alerts' })
  @ApiResponse({ status: 200, description: 'Metrics calculated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid filters' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  getMetrics(
    @GetActiveUser() user: ActiveUserDto,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: DigitalFileDashboardQueryDto,
  ) {
    return this.dashboardService.getMetrics(user, companyId, query);
  }
}