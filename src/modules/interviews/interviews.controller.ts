import { Controller, Post, Get, Body, Param, UseGuards, ParseIntPipe, Query, Patch, Delete, DefaultValuePipe } from '@nestjs/common';
import { InterviewsService } from './interviews.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProgramInterviewDto } from './dto/program-interview.dto';
import { UpdateMeetingDto } from './dto/update-interview.dto';
import { UpdateInterviewDto, RescheduleInterviewDto } from './dto/update-interview-base.dto';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@ApiTags('Interviews')
@ApiBearerAuth()
@Controller('companies/:companyId/interviews')
export class InterviewsController {
    constructor(private readonly interviewsService: InterviewsService) { }

    // ─── GETs estáticos primero ───────────────────────────────────────

    // Endpoint para obtener todas las entrevistas de una empresa
    @UseGuards(JwtAuthGuard)
    @Get()
    @ApiOperation({ summary: 'Get all interviews', description: 'Get all interviews for a company' })
    @ApiResponse({ status: 200, description: 'List of interviews for a company' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 404, description: 'No interviews found for this company' })
    @ApiQuery({ name: 'vacancyId', required: false, type: Number, description: 'Filter interviews by vacancy ID' })
    @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
    @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by title or vacancy name' })
    findAll(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('vacancyId') vacancyId?: string,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
        @Query('search') search?: string
    ) {
        return this.interviewsService.findAll(
            companyId,
            vacancyId ? Number(vacancyId) : undefined,
            page ?? 1,
            search || '',
            limit ?? 10
        );
    }

    // Endpoint para obtener el catalogo de vacantes activas para el formulario de creación de entrevista
    @UseGuards(JwtAuthGuard)
    @Get('/vacancies')
    @ApiOperation({ summary: 'Get active vacancies', description: 'Get vacancies approved by RH (idEstatusVacante = 5) for a company' })
    @ApiResponse({ status: 200, description: 'List of active vacancies for a company' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 404, description: 'No active vacancies found for this company' })
    findActiveVacancies(@Param('companyId', ParseIntPipe) companyId: number) {
        return this.interviewsService.findActiveVacancies(companyId);
    }

    // Endpoint para obtener el catalogo de estatus de entrevistas
    @UseGuards(JwtAuthGuard)
    @Get('/status')
    @ApiOperation({ summary: 'Get catalog of status for interviews', description: 'Get catalog of status for interviews' })
    @ApiResponse({ status: 200, description: 'Status obtained successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    getInterviewStatus(@Param('companyId', ParseIntPipe) companyId: number) {
        return this.interviewsService.getStatus(companyId);
    }

    // Endpoint para obtener el detalle completo de una entrevista catalogo
    @UseGuards(JwtAuthGuard)
    @Get('/detail/:interviewId')
    @ApiOperation({ summary: 'Get interview base data', description: 'Get complete editable data of an interview' })
    @ApiResponse({ status: 200, description: 'Interview data obtained successfully' })
    @ApiResponse({ status: 404, description: 'Interview not found' })
    findOne(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('interviewId') interviewId: string
    ) {
        return this.interviewsService.findOne(companyId, interviewId);
    }

    // Endpoint para obtener todas las entrevistas de un postulante (Perfil del postulante)
    @UseGuards(JwtAuthGuard)
    @Get('/postulant/:postulantId')
    @ApiOperation({ summary: 'Get all interviews for a postulante', description: 'Get all interviews for a postulante' })
    @ApiResponse({ status: 200, description: 'List of interviews for a postulante' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 404, description: 'No interviews found for this postulante' })
    findAllByPostulant(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('postulantId', ParseIntPipe) postulantId: number
    ) {
        return this.interviewsService.findAllByPostulant(companyId, postulantId);
    }

    // Endpoint para obtener el detalle de una entrevista programada específica
    @Get('/meetings/:meetingId')
    @ApiOperation({ summary: 'Get meeting detail', description: 'Get meeting detail' })
    @ApiResponse({ status: 200, description: 'Meeting detail' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 404, description: 'No meeting found for this meeting ID' })
    getMeetingDetail(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('meetingId') meetingId: string
    ) {
        return this.interviewsService.getMeetingDetail(companyId, meetingId);
    }

    // Endpoint para obtener todas las entrevistas programadas por id de entrevista catalogo
    @UseGuards(JwtAuthGuard)
    @Get(':interviewId')
    @ApiOperation({ summary: 'Get all programed interviews', description: 'Get all interviews that are programed, main interview and all its secondary interviews' })
    @ApiResponse({ status: 200, description: 'List of interviews for a company' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 404, description: 'No interviews found for this company' })
    findProgrammedInterviews(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('interviewId') interviewId: string
    ) {
        return this.interviewsService.findProgrammedInterviews(companyId, interviewId);
    }

    // Crear una entrevista como catalogo disponible para ser programada en una o varias vacantes
    @UseGuards(JwtAuthGuard)
    @Post()
    @ApiOperation({ summary: 'Create an interview', description: 'Create an interview' })
    @ApiResponse({ status: 201, description: 'Interview created successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    create(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() dto: CreateInterviewDto,
        @GetActiveUser() user: ActiveUserDto
    ) {
        return this.interviewsService.create(companyId, dto, user);
    }

    // Programar una entrevista ya creada como catalogo para un postulante
    @UseGuards(JwtAuthGuard)
    @Post('/:interviewId')
    @ApiOperation({ summary: 'Program an interview', description: 'Program an interview' })
    @ApiResponse({ status: 201, description: 'Interview programed successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    programInterview(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('interviewId') interviewId: string,
        @Body() dto: ProgramInterviewDto,
        @GetActiveUser() user: ActiveUserDto
    ) {
        return this.interviewsService.programInterview(companyId, interviewId, dto, user);
    }

    // ─── PATCHs ──────────────────────────────────────────────────────

    // Endpoint para actualizar una entrevista catalogo cuando no tiene entrevistas programadas
    @UseGuards(JwtAuthGuard)
    @Patch('/detail/:interviewId')
    @ApiOperation({ summary: 'Update interview', description: 'Update editable fields of an interview' })
    @ApiResponse({ status: 200, description: 'Interview updated successfully' })
    @ApiResponse({ status: 404, description: 'Interview not found' })
    updateInterview(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('interviewId') interviewId: string,
        @Body() dto: UpdateInterviewDto,
        @GetActiveUser() user: ActiveUserDto
    ) {
        return this.interviewsService.updateInterview(companyId, interviewId, dto, user);
    }

    // Endpoint que actualiza una entrevista programada
    @UseGuards(JwtAuthGuard)
    @Patch('/meetings/:meetingId')
    @ApiOperation({ summary: 'Update meeting', description: 'Update meeting' })
    @ApiResponse({ status: 200, description: 'Meeting updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 404, description: 'No meeting found for this meeting ID' })
    updateMeeting(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('meetingId') meetingId: string,
        @Body() dto: UpdateMeetingDto,
        @GetActiveUser() user: ActiveUserDto
    ) {
        return this.interviewsService.updateMeeting(companyId, meetingId, dto, user);
    }

    // Endpoint para reprogramar una entrevista
    @UseGuards(JwtAuthGuard)
    @Patch('/meetings/:meetingId/reschedule')
    @ApiOperation({ summary: 'Reschedule interview meeting', description: 'Update scheduled date and duration of a meeting' })
    @ApiResponse({ status: 200, description: 'Meeting rescheduled successfully' })
    @ApiResponse({ status: 404, description: 'Meeting not found' })
    rescheduleInterview(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('meetingId') meetingId: string,
        @Body() dto: RescheduleInterviewDto,
        @GetActiveUser() user: ActiveUserDto
    ) {
        return this.interviewsService.rescheduleInterview(companyId, meetingId, dto, user);
    }

    // ─── DELETE ──────────────────────────────────────────────────────

    // Endpoint para elimanr una entrevista catalogo cuando no tiene entrevistas programadas
    @UseGuards(JwtAuthGuard)
    @Delete('/detail/:interviewId')
    @ApiOperation({ summary: 'Delete interview', description: 'Delete an interview permanently' })
    @ApiResponse({ status: 200, description: 'Interview deleted successfully' })
    @ApiResponse({ status: 404, description: 'Interview not found' })
    deleteInterview(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('interviewId') interviewId: string,
        @GetActiveUser() user: ActiveUserDto
    ) {
        return this.interviewsService.deleteInterview(companyId, interviewId, user);
    }

    // Endpoint para eliminar una entrevista programada
    @UseGuards(JwtAuthGuard)
    @Delete('/meetings/:meetingId')
    @ApiOperation({ summary: 'Delete meeting', description: 'Delete a meeting permanently' })
    @ApiResponse({ status: 200, description: 'Meeting deleted successfully' })
    @ApiResponse({ status: 404, description: 'Meeting not found' })
    deleteMeeting(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('meetingId') meetingId: string,
        @GetActiveUser() user: ActiveUserDto
    ) {
        return this.interviewsService.deleteMeeting(companyId, meetingId, user);
    }
}