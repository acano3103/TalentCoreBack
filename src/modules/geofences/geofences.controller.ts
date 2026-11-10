import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreateGeofenceDto } from './dto/create-geofence.dto';
import { GeofencesService } from './geofences.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/geofences')
export class GeofencesController {
    constructor(private readonly geofenceService: GeofencesService) { }

    // Obtiene todas las geocercas de una empresa
    @Get()
    @ApiOperation({ summary: 'Get all geofences', description: 'Retrieves all geofences for a company.' })
    @ApiResponse({ status: 200, description: 'Geofences obtained successfully' })
    @ApiResponse({ status: 404, description: 'Geofences not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async findAll(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
    ) {
        return this.geofenceService.findAll(user, companyId);
    }

    // Crea una nueva geocerca
    @Post()
    @ApiOperation({ summary: 'Create geofence', description: 'Creates a complete geofence for a company.' })
    @ApiResponse({ status: 200, description: 'Geofence created successfully' })
    @ApiResponse({ status: 404, description: 'Geofence not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async create(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() createGeofenceDto: CreateGeofenceDto,
    ) {
        return await this.geofenceService.create(user, companyId, createGeofenceDto);
    }

    // Actualiza una geocerca
    @Patch(':geofenceId')
    @ApiOperation({ summary: 'Update geofence', description: 'Updates an existing geofence and synchronizes its polygon vertices.', })
    @ApiResponse({ status: 200, description: 'Geofence updated successfully', })
    @ApiResponse({ status: 404, description: 'Geofence not found or does not belong to the company', })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid', })
    async update(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('geofenceId', ParseIntPipe) geofenceId: number,
        @Body() updateGeofenceDto: CreateGeofenceDto,
    ) {
        return await this.geofenceService.update(user, companyId, geofenceId, updateGeofenceDto);
    }

    // Elimina una geocerca
    @Delete(':geofenceId')
    @ApiOperation({ summary: 'Delete geofence', description: 'Deletes a complete geofence by ID.' })
    @ApiResponse({ status: 200, description: 'Geofence deleted successfully' })
    @ApiResponse({ status: 404, description: 'Geofence not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async delete(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('geofenceId', ParseIntPipe) geofenceId: number,
    ) {
        return await this.geofenceService.delete(user, companyId, geofenceId);
    }
}
