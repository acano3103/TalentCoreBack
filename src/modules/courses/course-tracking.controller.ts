import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { CourseTrackingService } from './course-tracking.service';

// Reportería de seguimiento de una sesión Online Asíncrono (vista de administración)
@ApiBearerAuth()
@ApiTags('Course Tracking')
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/courses/sessions/:sessionId/tracking')
export class CourseTrackingController {
    constructor(private readonly courseTrackingService: CourseTrackingService) { }

    // Endpoint para obtener el seguimiento de todos los participantes de la sesión con un resumen general
    @Get()
    @ApiOperation({ summary: 'Get the tracking of all participants of a session', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Tracking per participant and summary' })
    @ApiResponse({ status: 404, description: 'Session not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    getSessionTracking(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @GetActiveUser() activeUser: ActiveUserDto,
    ) {
        return this.courseTrackingService.getSessionTracking(companyId, sessionId, activeUser);
    }

    // Endpoint para obtener el detalle de un participante: intentos de quiz y bitácora de actividad
    @Get(':participantId')
    @ApiOperation({ summary: 'Get quiz attempts and activity log of one participant', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Participant tracking detail' })
    @ApiResponse({ status: 404, description: 'Session or participant not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    getParticipantTracking(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @Param('participantId', ParseIntPipe) participantId: number,
        @GetActiveUser() activeUser: ActiveUserDto,
    ) {
        return this.courseTrackingService.getParticipantTracking(companyId, sessionId, participantId, activeUser);
    }
}
