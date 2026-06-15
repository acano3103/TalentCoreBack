import { Controller, Patch, Get, Param, Body, UseGuards, Query, ParseIntPipe, DefaultValuePipe, Post, Delete } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { ValidatePositionDto } from './dto/approve-reject.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { CreatePositionDto } from './dto/create-position.dto';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@ApiTags('Positions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('companies/:companyId/positions')
export class PositionsController {
    constructor(private readonly service: PositionsService) { }

    @Get()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all positions', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Positions obtained successfully' })
    @ApiResponse({ status: 404, description: 'Positions not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async findAll(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string,
    ) {
        const querySearch = search || '';
        return this.service.findAll(companyId, page, querySearch, limit);
    }

    @Get('/catalogs')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all position catalogs', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Position catalogs obtained successfully' })
    @ApiResponse({ status: 404, description: 'Position catalogs not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getCatalogs(
        @Param('companyId', ParseIntPipe) companyId: number,
    ) {
        return this.service.getCatalogs(companyId);
    }

    @Post()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a new position', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Position created successfully' })
    @ApiResponse({ status: 404, description: 'Position not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async create(
        @Param('companyId', ParseIntPipe) companyId: number,
        @GetActiveUser() activeUser: ActiveUserDto,
        @Body() data: CreatePositionDto,
    ) {
        return this.service.create(companyId, activeUser, data);
    }

    @Delete(':positionId')
    @ApiOperation({ summary: 'Disable position', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Position disabled successfully' })
    @ApiResponse({ status: 404, description: 'Position not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async disable(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('positionId', ParseIntPipe) positionId: number,
    ) {
        return this.service.changeStatus(companyId, positionId, false);
    }

    @Patch(':positionId/reactivate')
    @ApiOperation({ summary: 'Reactivate position', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Position reactivated successfully' })
    @ApiResponse({ status: 404, description: 'Position not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async reactivate(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('positionId', ParseIntPipe) positionId: number,
    ) {
        return this.service.changeStatus(companyId, positionId, true);
    }




    // Endpoint de la version vieja, elimar cuando el modulo de reclutamiento este completo y ya no se usen

    @Get('/vacancies')
    @ApiOperation({
        summary: 'Get all positions',
        description: 'Returns all positions for a company, optionally filtered by status (e.g., active, inactive).'
    })
    @ApiQuery({
        name: 'status',
        required: false,
        type: String,
        description: 'Filter positions by status (active, inactive). If omitted, returns all positions.'
    })
    @ApiResponse({ status: 200, description: 'Positions successfully retrieved.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async getPositions(@Param('companyId') companyId: number, @Query('status') status?: string) {
        return this.service.findAllPositions(Number(companyId), status);
    }

    @UseGuards(JwtAuthGuard)
    @Get(':positionId')
    @ApiOperation({ summary: 'Get position', description: 'Returns a position.' })
    @ApiResponse({ status: 200, description: 'Position successfully retrieved.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async getPosition(@Param('companyId') companyId: number, @Param('positionId') positionId: number) {
        return this.service.findPositionById(companyId, positionId);
    }

    @UseGuards(JwtAuthGuard)
    @Get(':positionId/summary')
    @ApiOperation({ summary: 'Get summary of postulants for a specific position' })
    @ApiResponse({ status: 200, description: 'Position summary obtained successfully.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async getSummary(@Param('positionId') positionId: string) {
        return await this.service.getPostulantsSummary(parseInt(positionId));
    }

    @UseGuards(JwtAuthGuard)//@UseGuards(JwtAuthGuard, ModulesGuard)
    //@Modules('Administrador')
    @Patch(':positionId')
    @ApiOperation({ summary: 'Validate a position', description: 'Validates a position and public it.' })
    @ApiResponse({ status: 201, description: 'Position successfully validated.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    async approveOrReject(
        @Param('companyId') companyId: number,
        @Param('positionId') positionId: number,
        @Body() dto: ValidatePositionDto
    ) {
        return this.service.approveOrReject(companyId, positionId, dto);
    }
}