import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards, ParseIntPipe, Query, DefaultValuePipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RequiredDocumentsService } from './required-documents.service';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CreateRequiredDocumentDto } from './dto/create-required-document.dto';
import { UpdateRequiredDocumentDto } from './dto/update-required-document.dto';

@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiTags('Required Documents')
@Controller('companies/:companyId/required-documents')
export class RequiredDocumentsController {
    constructor(private readonly requiredDocsService: RequiredDocumentsService) { }

    // Endpoint que crea un nuevo documento base
    @Post()
    @ApiOperation({ summary: 'Crear un nuevo documento base para el catálogo' })
    @ApiResponse({ status: 200, description: 'List of employees for a company' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    create(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() createDto: CreateRequiredDocumentDto,
        @GetActiveUser() user: ActiveUserDto
    ) {
        return this.requiredDocsService.create(companyId, createDto, user);
    }

    // Endpoint para actualizar un documento base
    @Put('/:documentId')
    @ApiOperation({ summary: 'Update a base document' })
    @ApiResponse({ status: 200, description: 'Base document updated successfully' })
    @ApiResponse({ status: 404, description: 'Base document not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async update(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('documentId', ParseIntPipe) documentId: number,
        @Body() updateDto: UpdateRequiredDocumentDto,
        @GetActiveUser() activeUser: ActiveUserDto
    ) {
        return this.requiredDocsService.update(companyId, documentId, updateDto, activeUser);
    }

    // Endpoint que obtiene los documentos configurados en la empresa
    @Get()
    @ApiOperation({ summary: 'Obtener todos los documentos configurados (Obligatorios y opcionales)' })
    @ApiResponse({ status: 200, description: 'List of employees for a company' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
    @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name or RFC' })
    findAll(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
    ) {
        return this.requiredDocsService.findAll(companyId, page, limit, search);
    }

    // Endpoint que desactiva un documento
    @Delete('/:documentId')
    @ApiOperation({ summary: 'Disable document', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Document disabled successfully' })
    @ApiResponse({ status: 404, description: 'Document not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async disable(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('documentId', ParseIntPipe) documentId: number,
        @GetActiveUser() activeUser: ActiveUserDto
    ) {
        return this.requiredDocsService.changeStatus(companyId, documentId, false, activeUser);
    }

    // Endpoint que reactiva un documento
    @Patch('/:documentId/reactivate')
    @ApiOperation({ summary: 'Reactivate document', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Document reactivated successfully' })
    @ApiResponse({ status: 404, description: 'Document not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async reactivate(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('documentId', ParseIntPipe) documentId: number,
        @GetActiveUser() activeUser: ActiveUserDto
    ) {
        return this.requiredDocsService.changeStatus(companyId, documentId, true, activeUser);
    }

}