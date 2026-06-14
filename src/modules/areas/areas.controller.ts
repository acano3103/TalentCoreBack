import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AreasService } from './areas.service';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';

@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/areas')
export class AreasController {
    constructor(private readonly areasService: AreasService) { }

    @Get()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all areas', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Areas obtained successfully' })
    @ApiResponse({ status: 404, description: 'Areas not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async findAll(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
    ) {
        const querySearch = search || '';
        return this.areasService.findAll(companyId, page, querySearch, limit);
    }

    @Get('/:areaId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get area', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Area obtained successfully' })
    @ApiResponse({ status: 404, description: 'Area not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async findOne(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('areaId', ParseIntPipe) areaId: number,
    ) {
        return this.areasService.findOne(companyId, areaId);
    }

    @Post()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create area', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Area created successfully' })
    @ApiResponse({ status: 404, description: 'Area not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async create(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() createAreaDto: CreateAreaDto,
    ) {
        return await this.areasService.create(companyId, createAreaDto);
    }

    @Put(':areaId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update area', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Area updated successfully' })
    @ApiResponse({ status: 404, description: 'Area not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async update(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('areaId', ParseIntPipe) areaId: number,
        @Body() updateAreaDto: UpdateAreaDto,
    ) {
        return await this.areasService.update(companyId, areaId, updateAreaDto);
    }

    @Delete('/:areaId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Disable area', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Area disabled successfully' })
    @ApiResponse({ status: 404, description: 'Area not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async disable(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('areaId', ParseIntPipe) areaId: number,
    ) {
        return this.areasService.changeStatus(companyId, areaId, false);
    }

    @Patch('/:areaId/reactivate')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Reactivate area', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Area reactivated successfully' })
    @ApiResponse({ status: 404, description: 'Area not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async reactivate(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('areaId', ParseIntPipe) areaId: number,
    ) {
        return this.areasService.changeStatus(companyId, areaId, true);
    }
}
