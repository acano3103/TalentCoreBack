import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateCompanyDto } from './dto/create-company.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@ApiTags('Companies')
@Controller('companies')
export class CompaniesController {
    constructor(private readonly companiesService: CompaniesService) { }

    // (GET) /companies
    @UseGuards(JwtAuthGuard)
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

    // (GET) /companies/{id}
    @UseGuards(JwtAuthGuard)
    @Get(':id')
    @ApiBearerAuth()
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

    // (POST) /companies
    @UseGuards(JwtAuthGuard)
    @Post()
    @ApiBearerAuth()
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

    // (PUT) /companies/{id}
    @UseGuards(JwtAuthGuard)
    @Put(':id')
    @ApiBearerAuth()
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

    @UseGuards(JwtAuthGuard)
    @Delete(':id')
    @ApiBearerAuth()
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

    @UseGuards(JwtAuthGuard)
    @Patch(':id/reactivate')
    @ApiBearerAuth()
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
