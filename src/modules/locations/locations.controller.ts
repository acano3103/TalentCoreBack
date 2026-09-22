import { Controller, Get, Query, UseGuards, ParseIntPipe, DefaultValuePipe, Param, Post, Body, Put, Delete, Patch, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/locations')
export class LocationsController {
    constructor(private readonly locationsService: LocationsService) { }

    // Obtiene todas las ubicaciones de una empresa con soporte para búsqueda y filtrado por unidad operativa
    @Get()
    @ApiOperation({ summary: 'Get all locations', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Locations obtained successfully' })
    @ApiResponse({ status: 404, description: 'Locations not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async findAll(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
        @Query('operatingUnitId') operatingUnitId?: string,
    ) {
        const querySearch = search || '';
        const unitId = operatingUnitId ? Number(operatingUnitId) : null;
        return this.locationsService.findAll(companyId, page, querySearch, limit, user, unitId);
    }

    // Crea una nueva ubicación
    @Post()
    @ApiOperation({ summary: 'Create a new location', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Location created successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @ApiResponse({ status: 404, description: 'Location not found' })
    @ApiResponse({ status: 400, description: 'Bad Request: Invalid input data' })
    async create(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() createLocationDto: CreateLocationDto,
    ) {
        return this.locationsService.create(companyId, createLocationDto, user);
    }

    // Procesa un archivo masivo de ubicaciones, registros patronales y unidades operativas
    @Post('bulk/upload/general')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Process a bulk file of locations, registries and operational units', description: 'Create in cascade and transactionally the Registry of Companies, Operational Units and finally the Locations.', })
    @ApiResponse({ status: 200, description: 'Bulk processing completed' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async uploadBulkLocations(
        @Param('companyId', ParseIntPipe) companyId: number,
        @UploadedFile() file: Express.Multer.File,
        @GetActiveUser() activeUser: ActiveUserDto,
    ) {
        return await this.locationsService.processBulkLocations(companyId, file, activeUser);
    }

    // Obtiene una ubicación por ID
    @Get(':locationId')
    @ApiOperation({ summary: 'Get location by ID', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Location obtained successfully' })
    @ApiResponse({ status: 404, description: 'Location not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getLocationById(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('locationId', ParseIntPipe) locationId: number,
    ) {
        return this.locationsService.getLocationById(companyId, locationId, user);
    }

    // Descarga una plantilla masiva de ubicaciones, registros patronales y unidades operativas
    @Get('bulk/template/general')
    @ApiOperation({ summary: 'Download general bulk template', description: 'Download general template for locations, registries and operational units', })
    @ApiResponse({ status: 200, description: 'Download general template for locations, registries and operational units' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async downloadBulkTemplate(
        @Param('companyId', ParseIntPipe) companyId: number,
        @GetActiveUser() activeUser: ActiveUserDto,
        @Res() res: Response,
    ) {
        const buffer = await this.locationsService.generateBulkTemplate(companyId, activeUser);
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="Plantilla_Estructura_Ubicaciones_${companyId}.xlsx"`,
            'Content-Length': buffer.length,
        });
        res.send(buffer);
    }

    // Actualiza una ubicación por ID
    @Put(':locationId')
    @ApiOperation({ summary: 'Update location by ID', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Location updated successfully' })
    @ApiResponse({ status: 404, description: 'Location not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @ApiResponse({ status: 400, description: 'Bad Request: Invalid input data' })
    async update(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('locationId', ParseIntPipe) locationId: number,
        @Body() updateLocationDto: UpdateLocationDto,
    ) {
        return this.locationsService.update(companyId, locationId, updateLocationDto, user);
    }

    // Desactiva una ubicación
    @Delete(':locationId')
    @ApiOperation({ summary: 'Disable location', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Location disabled successfully' })
    @ApiResponse({ status: 404, description: 'Location not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async disable(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('locationId', ParseIntPipe) locationId: number,
    ) {
        return this.locationsService.changeStatus(companyId, locationId, false, user);
    }

    // Reactiva una ubicación
    @Patch(':locationId/reactivate')
    @ApiOperation({ summary: 'Reactivate location', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Location reactivated successfully' })
    @ApiResponse({ status: 404, description: 'Location not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async reactivate(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('locationId', ParseIntPipe) locationId: number,
    ) {
        return this.locationsService.changeStatus(companyId, locationId, true, user);
    }
}
