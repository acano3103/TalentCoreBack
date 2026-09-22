import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AreasService } from './areas.service';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/areas')
export class AreasController {
    constructor(private readonly areasService: AreasService) { }

    // Endpoint que obtiene todas las áreas
    @Get()
    @ApiOperation({ summary: 'Get all areas', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Areas obtained successfully' })
    @ApiResponse({ status: 404, description: 'Areas not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async findAll(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
    ) {
        const querySearch = search || '';
        return this.areasService.findAll(user, companyId, page, querySearch, limit);
    }

    // Endpoint que obtiene un área
    @Get('/:areaId')
    @ApiOperation({ summary: 'Get area', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Area obtained successfully' })
    @ApiResponse({ status: 404, description: 'Area not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async findOne(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('areaId', ParseIntPipe) areaId: number,
    ) {
        return this.areasService.findOne(user, companyId, areaId);
    }

    // Endpoint que obtiene la plantilla para carga masiva de áreas y centros de costos
    @Get('bulk/template/general')
    @ApiOperation({ summary: 'Download bulk template for areas and cost centers', description: 'Generates an Excel template with Cost Centers, Area-Site assignments and location dropdowns', })
    @ApiResponse({ status: 200, description: 'Template generated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async downloadBulkTemplate(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Res() res: Response,
    ) {
        const buffer = await this.areasService.generateBulkTemplate(companyId, user);
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="Plantilla_Areas_Costos_${companyId}.xlsx"`,
            'Content-Length': buffer.length,
        });
        res.send(buffer);
    }

    // Endpoint que crea un área
    @Post()
    @ApiOperation({ summary: 'Create area', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Area created successfully' })
    @ApiResponse({ status: 404, description: 'Area not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async create(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() createAreaDto: CreateAreaDto,
    ) {
        return await this.areasService.create(user, companyId, createAreaDto);
    }

    // Endpoint que carga las áreas y centros de costos masivamente
    @Post('bulk/upload/general')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Process bulk file for areas and cost centers', description: 'Creates Cost Centers, Master Areas and assigns them to Sites with budget validations', })
    @ApiResponse({ status: 200, description: 'Bulk file processed successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async uploadBulkAreas(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return await this.areasService.processBulkAreas(companyId, file, user);
    }

    // Endpoint que actualiza un área
    @Put(':areaId')
    @ApiOperation({ summary: 'Update area', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Area updated successfully' })
    @ApiResponse({ status: 404, description: 'Area not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async update(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('areaId', ParseIntPipe) areaId: number,
        @Body() updateAreaDto: UpdateAreaDto,
    ) {
        return await this.areasService.update(user, companyId, areaId, updateAreaDto);
    }

    // Endpoint que desactiva un área
    @Delete('/:areaId')
    @ApiOperation({ summary: 'Disable area', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Area disabled successfully' })
    @ApiResponse({ status: 404, description: 'Area not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async disable(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('areaId', ParseIntPipe) areaId: number,
    ) {
        return this.areasService.changeStatus(user, companyId, areaId, false);
    }

    // Endpoint que reactiva un área
    @Patch('/:areaId/reactivate')
    @ApiOperation({ summary: 'Reactivate area', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Area reactivated successfully' })
    @ApiResponse({ status: 404, description: 'Area not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async reactivate(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('areaId', ParseIntPipe) areaId: number,
    ) {
        return this.areasService.changeStatus(user, companyId, areaId, true);
    }
}
