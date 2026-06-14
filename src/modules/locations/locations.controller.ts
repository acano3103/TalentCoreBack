import { Controller, Get, Query, UseGuards, ParseIntPipe, DefaultValuePipe, Param, Post, Body, Put, Delete, Patch } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/locations')
export class LocationsController {
    constructor(private readonly locationsService: LocationsService) { }

    @Get()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all locations', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Locations obtained successfully' })
    @ApiResponse({ status: 404, description: 'Locations not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async findAll(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
    ) {
        const querySearch = search || '';
        return this.locationsService.findAll(companyId, page, querySearch, limit);
    }

    @Post()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a new location', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Location created successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @ApiResponse({ status: 404, description: 'Location not found' })
    @ApiResponse({ status: 400, description: 'Bad Request: Invalid input data' })
    async create(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() createLocationDto: CreateLocationDto,
    ) {
        return this.locationsService.create(companyId, createLocationDto);
    }

    @Get(':locationId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get location by ID', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Location obtained successfully' })
    @ApiResponse({ status: 404, description: 'Location not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getLocationById(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('locationId', ParseIntPipe) locationId: number,
    ) {
        return this.locationsService.getLocationById(companyId, locationId);
    }

    @Put(':locationId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update location by ID', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Location updated successfully' })
    @ApiResponse({ status: 404, description: 'Location not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @ApiResponse({ status: 400, description: 'Bad Request: Invalid input data' })
    async update(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('locationId', ParseIntPipe) locationId: number,
        @Body() updateLocationDto: UpdateLocationDto,
    ) {
        return this.locationsService.update(companyId, locationId, updateLocationDto);
    }

    @Delete(':locationId')
    @ApiOperation({ summary: 'Disable location', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Location disabled successfully' })
    @ApiResponse({ status: 404, description: 'Location not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async disable(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('locationId', ParseIntPipe) locationId: number,
    ) {
        return this.locationsService.changeStatus(companyId, locationId, false);
    }

    @Patch(':locationId/reactivate')
    @ApiOperation({ summary: 'Reactivate location', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Location reactivated successfully' })
    @ApiResponse({ status: 404, description: 'Location not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async reactivate(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('locationId', ParseIntPipe) locationId: number,
    ) {
        return this.locationsService.changeStatus(companyId, locationId, true);
    }
}
