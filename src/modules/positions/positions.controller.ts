import { Controller, Patch, Get, Param, Body, UseGuards, Query, ParseIntPipe, DefaultValuePipe, Post, Delete, Put } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { ValidatePositionDto } from './dto/approve-reject.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { CreatePositionDto } from './dto/create-position.dto';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreatePositionRequestDto } from './dto/create-position-request.dto';
import { ValidatePositionRequestDto } from './dto/approve-reject-reques.dto';

@ApiTags('Positions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('companies/:companyId/positions')
export class PositionsController {
    constructor(private readonly service: PositionsService) { }

    // Obtiene todas las solicitudes de puesto
    @Get('requests')
    @ApiOperation({ summary: 'Get all position requests for the administration panel', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Requests obtained successfully.' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    async findAllRequests(
        @Param('companyId', ParseIntPipe) companyId: number,
        @GetActiveUser() activeUser: ActiveUserDto,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('filterByUser') filterByUser: boolean,
        @Query('estatusId') estatusId?: number,
        @Query('search') search?: string,
    ) {
        return this.service.findAllRequests(companyId, activeUser, page, limit, filterByUser, estatusId, search);
    }

    // Obtiene el catalogo de estatus de solicitudes
    @Get('requests/status')
    @ApiOperation({ summary: 'Get all catalog status of requests', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Requests status obtained successfully.' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    async getRequestsStatus(
        @Param('companyId', ParseIntPipe) companyId: number,
    ) {
        return this.service.getRequestsStatus(companyId);
    }

    // Crea una nueva solicitud de puesto
    @Post('requests')
    @ApiOperation({ summary: 'Create a new position request (raw text)', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Request registered successfully.' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    async createRequest(
        @Param('companyId', ParseIntPipe) companyId: number,
        @GetActiveUser() activeUser: ActiveUserDto,
        @Body() data: CreatePositionRequestDto,
    ) {
        return this.service.createRequest(companyId, activeUser, data);
    }

    // Aprueba o rechaza una solicitud de puesto
    @Patch('requests/:requestId')
    @ApiOperation({ summary: 'Validate a position request', description: 'Validates a position request and public it.' })
    @ApiResponse({ status: 201, description: 'Position request successfully validated.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    async approveOrRejectRequests(
        @Param('companyId', ParseIntPipe) companyId: number,
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('requestId', ParseIntPipe) requestId: number,
        @Body() data: ValidatePositionRequestDto,
    ) {
        return this.service.approveOrRejectRequests(companyId, requestId, activeUser, data);
    }

    // Elimina una solicitud de puesto
    @Delete('requests/:requestId')
    @ApiOperation({ summary: 'Delete a position request', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Request deleted successfully.' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    async deleteRequest(
        @Param('companyId', ParseIntPipe) companyId: number,
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('requestId', ParseIntPipe) requestId: number,
    ) {
        return this.service.deleteRequest(companyId, requestId, activeUser);
    }

    // Obtener todos los puestos páginados
    @Get()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all positions', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Positions obtained successfully' })
    @ApiResponse({ status: 404, description: 'Positions not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async findAll(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('aprobada', new DefaultValuePipe(1), ParseIntPipe) aprobada: number,
        @Query('search') search?: string,
    ) {
        const querySearch = search || '';
        return this.service.findAll(activeUser, companyId, page, querySearch, limit, aprobada);
    }

    // Obtiene los catálogos necesarios para la creación de un puesto
    @Get('/catalogs')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all position catalogs', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Position catalogs obtained successfully' })
    @ApiResponse({ status: 404, description: 'Position catalogs not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getCatalogs(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
    ) {
        return this.service.getCatalogs(activeUser, companyId);
    }

    // Obtiene un puesto especifico por su id
    @Get(':positionId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get a position', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Position obtained successfully' })
    @ApiResponse({ status: 404, description: 'Position not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async findOne(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('positionId', ParseIntPipe) positionId: number,
        @Query('specific', new DefaultValuePipe(1), ParseIntPipe) specific: number,
    ) {
        return this.service.findOne(activeUser, companyId, positionId, specific);
    }

    // Actualiza un puesto completo con todos sus datos
    @Put(':positionId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update a position', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Position updated successfully' })
    @ApiResponse({ status: 404, description: 'Position not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async update(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('positionId', ParseIntPipe) positionId: number,
        @Body() data: CreatePositionDto,
    ) {
        return this.service.update(activeUser, companyId, positionId, data);
    }

    // Obtiene los horarios de un puesto específico
    @Get(':positionId/schedule')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get schedule (horarios) for a position', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Position schedule obtained successfully' })
    @ApiResponse({ status: 404, description: 'Position not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getSchedule(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('positionId', ParseIntPipe) positionId: number,
    ) {
        return this.service.getSchedule(activeUser, companyId, positionId);
    }

    // Obtiene los documentos requeridos de un puesto específico
    @Get(':positionId/required-documents')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get required documents for a position', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Position required documents obtained successfully' })
    @ApiResponse({ status: 404, description: 'Position not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getRequiredDocuments(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('positionId', ParseIntPipe) positionId: number,
    ) {
        return this.service.getRequiredDocuments(activeUser, companyId, positionId);
    }

    // Genera la descripción de un puesto mediante IA
    @Post(':positionId/generate-ai-description')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Generate AI description for a vacanci', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'AI description generated successfully' })
    @ApiResponse({ status: 404, description: 'Position not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async generateAIPositionDescription(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('positionId', ParseIntPipe) positionId: number,
    ) {
        return this.service.generateAIPositionDescription(activeUser, companyId, positionId);
    }

    // Crea el descriptivo de puesto completo
    @Post()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a new position', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Position created successfully' })
    @ApiResponse({ status: 404, description: 'Position not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async create(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() data: CreatePositionDto,
    ) {
        return this.service.create(activeUser, companyId, data);
    }

    // Desactiva un puesto específico
    @Delete(':positionId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Disable position', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Position disabled successfully' })
    @ApiResponse({ status: 404, description: 'Position not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async disable(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('positionId', ParseIntPipe) positionId: number,
    ) {
        return this.service.changeStatus(activeUser, companyId, positionId, false);
    }

    //@UseGuards(JwtAuthGuard, ModulesGuard)
    //@Modules('Administrador')
    // Valida un puesto específico, puede aprobarlo o rechazarlo
    @Patch(':positionId')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Validate a position', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Position validated successfully' })
    @ApiResponse({ status: 404, description: 'Position not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async approveOrReject(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('positionId', ParseIntPipe) positionId: number,
        @Body() dto: ValidatePositionDto,
    ) {
        return this.service.approveOrReject(activeUser, companyId, positionId, dto);
    }

    // Reactiva un puesto específico
    @Patch(':positionId/reactivate')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Reactivate position', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Position reactivated successfully' })
    @ApiResponse({ status: 404, description: 'Position not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async reactivate(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('positionId', ParseIntPipe) positionId: number,
    ) {
        return this.service.changeStatus(activeUser, companyId, positionId, true);
    }
}