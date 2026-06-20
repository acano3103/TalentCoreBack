import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { OrganizationChartService } from './organization-chart.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Organization Chart')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('companies/:companyId/organization-chart')
export class OrganizationChartController {
    constructor(private readonly service: OrganizationChartService) { }

    @Get('')
    @ApiOperation({ summary: 'Get organization chart' })
    @ApiResponse({ status: 200, description: 'Organization chart obtained successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getOrganizationChart(
        @Param('companyId', ParseIntPipe) companyId: number,
    ) {
        return this.service.getOrganizationChart(companyId);
    }
}
