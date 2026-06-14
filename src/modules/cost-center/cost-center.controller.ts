import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CostCenterService } from './cost-center.service';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';

@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/cost-centers')
export class CostCenterController {
    constructor(private readonly costCenterService: CostCenterService) { }

    @Get()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all cost centers', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Cost centers obtained successfully' })
    @ApiResponse({ status: 404, description: 'Cost centers not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async findAll(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
    ) {
        const querySearch = search || '';
        return this.costCenterService.findAll(companyId, page, querySearch, limit);
    }

    @Get('/:costCenterId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get one cost center', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Cost center obtained successfully' })
    @ApiResponse({ status: 404, description: 'Cost center not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async findOne(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('costCenterId', ParseIntPipe) costCenterId: number,
    ) {
        return await this.costCenterService.findOne(companyId, costCenterId);
    }

    @Post()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create cost center', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Cost center created successfully' })
    @ApiResponse({ status: 404, description: 'Cost center not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async create(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() createCostCenterDto: CreateCostCenterDto,
    ) {
        return await this.costCenterService.create(companyId, createCostCenterDto);
    }

    @Put('/:costCenterId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update cost center', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Cost center updated successfully' })
    @ApiResponse({ status: 404, description: 'Cost center not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async update(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('costCenterId', ParseIntPipe) costCenterId: number,
        @Body() updateCostCenterDto: UpdateCostCenterDto,
    ) {
        return await this.costCenterService.update(companyId, costCenterId, updateCostCenterDto);
    }

    @Delete('/:costCenterId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Disable cost center', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Cost center disabled successfully' })
    @ApiResponse({ status: 404, description: 'Cost center not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async disable(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('costCenterId', ParseIntPipe) costCenterId: number,
    ) {
        return this.costCenterService.changeStatus(companyId, costCenterId, false);
    }

    @Patch('/:costCenterId/reactivate')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Reactivate cost center', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Cost center reactivated successfully' })
    @ApiResponse({ status: 404, description: 'Cost center not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async reactivate(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('costCenterId', ParseIntPipe) costCenterId: number,
    ) {
        return this.costCenterService.changeStatus(companyId, costCenterId, true);
    }
}
