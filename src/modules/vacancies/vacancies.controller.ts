import { Controller, Get, Post, Put, Patch, Body, Param, Query, ParseIntPipe, UseGuards, DefaultValuePipe, Delete } from '@nestjs/common';
import { VacanciesService } from './vacancies.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreateRequisitionDto } from './dto/create-requisition.dto';

@ApiTags('Vacancies')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('companies/:companyId/vacancies')
export class VacanciesController {
    constructor(private readonly vacanciesService: VacanciesService) { }

    // ==========================================
    // ENDPOINTS: Subservicio de vacantes
    // ==========================================

    // Endpoint para obtener todas las vacantes paginadas de una empresa
    @Get()
    @ApiOperation({ summary: 'Get all vacancies', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Vacancies obtained successfully' })
    @ApiResponse({ status: 404, description: 'Vacancies not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async findAll(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string
    ) {
        const querySearch = search || '';
        return this.vacanciesService.findAll(activeUser, companyId, page, querySearch, limit);
    }

    // Endpoint para obtener el resumen de postulaciones de una vacante específica
    @Get(':vacancyId/summary')
    @ApiOperation({ summary: 'Get summary of postulants for a specific vacancy' })
    @ApiResponse({ status: 200, description: 'Vacancy summary obtained successfully.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async getSummary(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('vacancyId', ParseIntPipe) vacancyId: number
    ) {
        return await this.vacanciesService.getVacancyPostulantsSummary(companyId, vacancyId);
    }

    // Endpoint para cerrar o cancelar una vacante
    @Patch(':vacancyId/state')
    @ApiOperation({ summary: 'Close or cancel a vacancy' })
    @ApiResponse({ status: 200, description: 'Vacancy closed or canceled successfully.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async closeOrCancelVacancy(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('vacancyId', ParseIntPipe) vacancyId: number,
        @Query('status') status: "CERRADA" | "CANCELADA",
    ) {
        return await this.vacanciesService.closeOrCancelVacancy(activeUser, companyId, vacancyId, status);
    }

    // ==========================================
    // ENDPOINTS: Subservicio de solicitudes de puesto (Requisiciones)
    // ==========================================

    // Endpoint para obtener todas las requisiciones paginadas de una empresa
    @Get('requisitions')
    @ApiOperation({ summary: 'Get all requisitions', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Requisitions obtained successfully' })
    @ApiResponse({ status: 404, description: 'Requisitions not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getRequisitions(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string
    ) {
        const querySearch = search || '';
        return this.vacanciesService.findAllRequisitions(activeUser, companyId, page, querySearch, limit);
    }

    // Obtiene todos los puestos a cargo de la persona que hace la solicitud
    @Get('requisitions/allowed-positions')
    @ApiOperation({ summary: 'Get all allowed positions for requisition', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Allowed positions for requisition obtained successfully' })
    @ApiResponse({ status: 404, description: 'Allowed positions for requisition not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getAllowedPositionsForRequisition(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number
    ) {
        return this.vacanciesService.findAllowedPositions(activeUser, companyId);
    }

    // Obtiene todas las locaciones donde el usuario tiene permiso de crear vacantes
    @Get('requisitions/allowed-locations')
    @ApiOperation({ summary: 'Get all allowed physical locations for requisition based on user permissions', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Allowed locations for requisition obtained successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getAllowedLocationsForRequisition(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number
    ) {
        return this.vacanciesService.findAllowedLocations(activeUser, companyId);
    }

    // Obtiene todos los catálogos necesarios para la creación de una vacante
    @Get('requisitions/catalogs')
    @ApiOperation({ summary: 'Get all catalogs needed in requisition creation', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Catalogs for requisition obtained successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getRequisitionCatalogs(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('positionId', ParseIntPipe) positionId: number,
    ) {
        return this.vacanciesService.findRequisitionCatalogs(activeUser, companyId, positionId);
    }

    // Obtiene una requisición específica por su id
    @Get('requisitions/:requisitionId')
    @ApiOperation({ summary: 'Get a requisition by id', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Requisition obtained successfully' })
    @ApiResponse({ status: 404, description: 'Requisition not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getRequisitionsById(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('requisitionId', ParseIntPipe) requisitionId: number,
    ) {
        return this.vacanciesService.findRequisitionById(activeUser, companyId, requisitionId);
    }

    // Crear una nueva requisición
    @Post('requisitions')
    @ApiOperation({ summary: 'Create a new requisition', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Requisition created successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async createRequisition(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() createRequisitionDto: CreateRequisitionDto,
    ) {
        return this.vacanciesService.createRequisition(activeUser, companyId, createRequisitionDto);
    }

    // Elimina permanentemente una requisición
    @Delete('requisitions/:requisitionId')
    @ApiOperation({ summary: 'Delete a requisition', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Requisition deleted successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async deleteRequisition(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('requisitionId', ParseIntPipe) requisitionId: number,
    ) {
        return this.vacanciesService.deleteRequisition(activeUser, companyId, requisitionId);
    }

    // Endpoint para aprovar o rechazar una requisición como manager o rh
    @Patch('requisitions/:requisitionId')
    @ApiOperation({ summary: 'Evaluate a requisition', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Requisition evaluated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async evaluateRequisition(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('requisitionId', ParseIntPipe) requisitionId: number,
        @Body() { action, recruiterId }: { action: 'aprobar' | 'rechazar', recruiterId?: number }
    ) {
        return this.vacanciesService.evaluateRequisition(activeUser, companyId, requisitionId, action, recruiterId);
    }

    // SECCIÓN 3: DETALLE DE VACANTE (dinámico, al final para evitar colisión con rutas estáticas)
    @Get(':vacancyId')
    @ApiOperation({ summary: 'Get vacancy detail', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Vacancy detail obtained successfully' })
    @ApiResponse({ status: 404, description: 'Vacancy not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getVacancyDetail(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('vacancyId', ParseIntPipe) vacancyId: number
    ) {
        return this.vacanciesService.findOneVacancy(companyId, vacancyId);
    }
}
