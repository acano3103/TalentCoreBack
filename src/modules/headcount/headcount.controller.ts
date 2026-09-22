import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HeadcountService } from './headcount.service';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { UpdateHeadcountDto } from './dto/update-headcount.dto';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Headcount')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('companies/:companyId/headcount')
export class HeadcountController {
    constructor(private readonly headcountService: HeadcountService) { }

    // Obtiene todo el headcount de la empresa paginado y filtrado
    @Get()
    @ApiOperation({ summary: 'Get all headcount', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Headcount obtained successfully' })
    @ApiResponse({ status: 404, description: 'Headcount not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async findAll(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
        @Query('locationId', new ParseIntPipe({ optional: true })) locationId?: number,
    ) {
        const querySearch = search || '';
        return this.headcountService.findAll(companyId, page, querySearch, limit, locationId);
    }

    // Actualiza las plazas autorizadas para roles
    @Patch()
    @ApiOperation({ summary: 'Update authorized headcount plazas for specific roles', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Plazas updated successfully' })
    @ApiResponse({ status: 400, description: 'Bad request / Invalid data verification' })
    async updatePlazas(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() updateDto: UpdateHeadcountDto,
    ) {
        return this.headcountService.update(companyId, updateDto);
    }

    // Endpoint para descargar la plantilla Excel con la matriz de plazas precargada
    @Get('bulk/template')
    @ApiOperation({ summary: 'Download bulk template for headcount plazas', description: 'Generates an Excel template with Site-Area-Position combinations and current authorized plazas' })
    @ApiResponse({ status: 200, description: 'Template generated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async downloadBulkTemplate(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Res() res: Response,
    ) {
        const buffer = await this.headcountService.generateBulkTemplate(companyId);
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="Plantilla_Plazas_Headcount_${companyId}.xlsx"`,
            'Content-Length': buffer.length,
        });
        res.send(buffer);
    }

    // Endpoint para subir y procesar el Excel de plazas
    @Post('bulk/upload')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Process bulk file for headcount plazas', description: 'Updates authorized plazas for positions across sites' })
    @ApiResponse({ status: 200, description: 'Bulk file processed successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async uploadBulkPlazas(
        @Param('companyId', ParseIntPipe) companyId: number,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return await this.headcountService.processBulkPlazas(companyId, file);
    }
}
