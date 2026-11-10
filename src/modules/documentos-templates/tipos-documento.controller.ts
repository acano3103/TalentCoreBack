import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { DocumentosTemplatesService } from './documentos-templates.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreateTipoDocumentoDto } from './dto/create-tipo-documento.dto';

@ApiTags('Documentos Templates')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('companies/:companyId/documentos/tipos')
export class TiposDocumentoController {
    constructor(private readonly service: DocumentosTemplatesService) { }

    @Get()
    @ApiOperation({ summary: 'List document types for a company', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Document types listed' })
    async findAll(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
    ) {
        return this.service.findTiposDocumento(companyId);
    }

    @Post()
    @ApiOperation({ summary: 'Create a new document type', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Document type created' })
    @ApiResponse({ status: 400, description: 'Duplicate name' })
    async create(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() dto: CreateTipoDocumentoDto,
    ) {
        return this.service.createTipoDocumento(companyId, dto.nombre);
    }
}
