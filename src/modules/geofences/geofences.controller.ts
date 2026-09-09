import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
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
    @ApiOperation({ summary: 'Get all geofences', description: SWAGGER_AUTH_DESCRIPTION })
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
    @ApiOperation({ summary: 'Create geofence', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Cost center created successfully' })
    @ApiResponse({ status: 404, description: 'Cost center not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async create(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() createGeofenceDto: CreateGeofenceDto,
    ) {
        return await this.geofenceService.create(user, companyId, createGeofenceDto);
    }
}
