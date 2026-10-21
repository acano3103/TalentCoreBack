import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IncidentsService } from './incidents.service';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';
import { GetIncidentRequestDetailDto } from './dto/get-incident-request-detail.dto';

@ApiTags('Incidents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/incidents')
export class IncidentsController {
    constructor(private readonly incidentsService: IncidentsService) { }

    // Obtiene todas las incidencias de la empresa
    @Get()
    @ApiOperation({ summary: 'Get all incidents', description: 'Get all incidents of the company.', })
    @ApiResponse({ status: 200, description: 'All incidents retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    findAll(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: QueryIncidentsDto,
    ) {
        return this.incidentsService.findAll(activeUser, companyId, query);
    }

    // Obtiene el detalle de una incidencia con su flujo de aprobacion
    @Get('detail')
    @ApiOperation({ summary: 'Get incident request detail', description: 'Gets an incident request and its approval flow without requiring the current user to be its assigned approver.', })
    @ApiResponse({ status: 200, description: 'Incident request detail retrieved successfully', })
    @ApiResponse({ status: 400, description: 'Invalid request origin.', })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.', })
    @ApiResponse({ status: 404, description: 'The incident request does not exist.', })
    getIncidentRequestDetail(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: GetIncidentRequestDetailDto,
    ) {
        return this.incidentsService.getIncidentRequestDetail(activeUser, companyId, query);
    }

    // Obtiene todas las incidencias que el empleado solicito
    @Get('requested')
    @ApiOperation({ summary: 'Get all incidents requested', description: 'Get all incidents of the employee.', })
    @ApiResponse({ status: 200, description: 'All incidents retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    findAllRequested(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: QueryIncidentsDto,
    ) {
        return this.incidentsService.findAllRequested(activeUser, companyId, query);
    }

    // Obtiene el detalle de una incidencia con su flujo de aprobacion
    @Get('requested/detail')
    @ApiOperation({ summary: 'Get requested incident detail', description: 'Gets an incident request and its approval flow without requiring the current user to be its assigned approver.', })
    @ApiResponse({ status: 200, description: 'Incident request detail retrieved successfully', })
    @ApiResponse({ status: 400, description: 'Invalid request origin.', })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.', })
    @ApiResponse({ status: 404, description: 'The incident request does not exist.', })
    getIncidentRequestedDetail(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: GetIncidentRequestDetailDto,
    ) {
        return this.incidentsService.getIncidentRequestedDetail(activeUser, companyId, query);
    }

}