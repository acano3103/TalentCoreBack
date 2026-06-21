import { Controller, Get, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { OrganizationChartService } from './organization-chart.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Organization Chart')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('companies/:companyId/organization-chart')
export class OrganizationChartController {
    constructor(private readonly service: OrganizationChartService) { }

    @Get('authorized')
    @ApiOperation({ summary: 'Get authorized organization chart with optional filters' })
    @ApiQuery({ name: 'siteId', required: false, type: Number })
    @ApiQuery({ name: 'areaId', required: false, type: Number })
    @ApiResponse({ status: 200, description: 'Authorized organization chart obtained successfully' })
    async getAuthorizedChart(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('siteId') siteId?: string,
        @Query('areaId') areaId?: string,
    ) {
        const parsedSiteId = siteId ? Number(siteId) : undefined;
        const parsedAreaId = areaId ? Number(areaId) : undefined;
        return this.service.getAuthorizedChart(companyId, parsedSiteId, parsedAreaId);
    }

    @Get('nominal')
    @ApiOperation({ summary: 'Get real organization chart (Nominal/Active Employees + Active Vacancies)' })
    @ApiQuery({ name: 'siteId', required: false, type: Number })
    @ApiQuery({ name: 'areaId', required: false, type: Number })
    @ApiResponse({ status: 200, description: 'Real organization chart obtained successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getRealChart(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('siteId') siteId?: string,
        @Query('areaId') areaId?: string,
    ) {
        const parsedSiteId = siteId ? Number(siteId) : undefined;
        const parsedAreaId = areaId ? Number(areaId) : undefined;
        return this.service.getRealChart(companyId, parsedSiteId, parsedAreaId);
    }
}