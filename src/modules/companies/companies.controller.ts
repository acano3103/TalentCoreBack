import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateCompanyDto } from './dto/create-company.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Response } from 'express';

@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiTags('Companies')
@Controller('companies')
export class CompaniesController {
    constructor(private readonly companiesService: CompaniesService) { }

    // Obtiene todas las empresas paginadas de un tenant especifico
    @Get()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all companies paginated', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Companies obtained correctly' })
    @ApiResponse({ status: 404, description: 'Companies not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    findAll(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Query('page') page: string = '1',
        @Query('search') search: string = '',
        @Query('limit') limit: string = '10'
    ) {
        const pageNumber = parseInt(page, 10) || 1;
        const limitNumber = parseInt(limit, 10) || 10;
        return this.companiesService.findAll(pageNumber, search, limitNumber, activeUser);
    }

    // Obtiene una empresa por id de un tenant especifico
    @Get(':id')
    @ApiOperation({ summary: 'Get company by id', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Company obtained correctly' })
    @ApiResponse({ status: 404, description: 'Company not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    findOne(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('id') id: string,
    ) {
        return this.companiesService.findOne(id, activeUser);
    }

    // Descarga una plantilla para crear empresas masivamente
    @Get('bulk/template')
    @ApiOperation({ summary: 'Download bulk upload Excel template for companies', description: 'Generates and streams an Excel template with corporate and address fields for bulk company creation' })
    @ApiResponse({ status: 200, description: 'Template generated and downloaded successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async downloadBulkTemplate(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Res() res: Response
    ) {
        const buffer = await this.companiesService.generateBulkTemplate(activeUser);
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="Plantilla_Empresas.xlsx"',
            'Content-Length': buffer.length,
        });
        res.send(buffer);
    }

    // Crea una nueva empresa en un tenant especifico
    @Post()
    @ApiOperation({ summary: 'Create a new company', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Company created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @UseInterceptors(FileInterceptor('logo_file'))
    create(
        @Body() createCompanyDto: CreateCompanyDto,
        @UploadedFile() file: Express.Multer.File,
        @GetActiveUser() activeUser: ActiveUserDto
    ) {
        return this.companiesService.create(createCompanyDto, file, activeUser);
    }

    // Procesa el archivo Excel de empresas cargado
    @Post('bulk/upload')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Upload and process bulk companies Excel file', description: 'Parses the uploaded Excel file, validates RFC, and creates companies along with their fiscal address in bulk' })
    @ApiResponse({ status: 200, description: 'Bulk file processed successfully' })
    @ApiResponse({ status: 400, description: 'No file uploaded or invalid file format' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async uploadBulkCompanies(
        @UploadedFile() file: Express.Multer.File,
        @GetActiveUser() activeUser: ActiveUserDto
    ) {
        return await this.companiesService.processBulkCompanies(file, activeUser);
    }

    // Actualiza una empresa de un tenant especifico
    @Put(':id')
    @ApiOperation({ summary: 'Update a company', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Company updated successfully' })
    @ApiResponse({ status: 404, description: 'Company not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @UseInterceptors(FileInterceptor('logo_file'))
    update(
        @Param('id') id: string,
        @Body() updateCompanyDto: UpdateCompanyDto,
        @UploadedFile() file: Express.Multer.File,
        @GetActiveUser() activeUser: ActiveUserDto
    ) {
        return this.companiesService.update(id, updateCompanyDto, file, activeUser);
    }

    // Desactiva una empresa de un tenant especifico
    @Delete(':id')
    @ApiOperation({ summary: 'Disable a company', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Company disabled successfully' })
    @ApiResponse({ status: 404, description: 'Company not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    disableCompany(
        @Param('id') id: string,
        @GetActiveUser() activeUser: ActiveUserDto
    ) {
        return this.companiesService.changeStatus(id, false, activeUser);
    }

    // Reactiva una empresa de un tenant especifico
    @Patch(':id/reactivate')
    @ApiOperation({ summary: 'Reactivate a company', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Company reactivated successfully' })
    @ApiResponse({ status: 404, description: 'Company not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    reactivateCompany(
        @Param('id') id: string,
        @GetActiveUser() activeUser: ActiveUserDto
    ) {
        return this.companiesService.changeStatus(id, true, activeUser);
    }
}
