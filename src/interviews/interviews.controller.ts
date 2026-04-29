import { Controller, Post, Get, Body, Param, UseGuards, ParseIntPipe, Query, Patch } from '@nestjs/common';
import { InterviewsService } from './interviews.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProgramInterviewDto } from './dto/program-interview.dto';
import { UpdateMeetingDto } from './dto/update-interview.dto';

@ApiTags('Interviews')
@ApiBearerAuth()
@Controller('companies/:companyId/interviews')
export class InterviewsController {
    constructor(private readonly interviewsService: InterviewsService) { }

    @UseGuards(JwtAuthGuard)
    @Get()
    @ApiOperation({ summary: 'Get all interviews', description: 'Get all interviews for a company' })
    @ApiResponse({ status: 200, description: 'List of interviews for a company' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 404, description: 'No interviews found for this company' })
    @ApiQuery({
        name: 'positionId',
        required: false,
        type: Number,
        description: 'Filter interviews by position ID'
    })
    findAll(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('positionId') positionId?: string
    ) {
        return this.interviewsService.findAll(companyId, positionId ? Number(positionId) : undefined);
    }

    @UseGuards(JwtAuthGuard)
    @Get('/positions')
    @ApiOperation({ summary: 'Get active positions', description: 'Get active positions for a company' })
    @ApiResponse({ status: 200, description: 'List of active positions for a company' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 404, description: 'No active positions found for this company' })
    findActivePositions(@Param('companyId', ParseIntPipe) companyId: number) {
        return this.interviewsService.findActivePositions(companyId);
    }

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

    @UseGuards(JwtAuthGuard)
    @Post()
    @ApiOperation({ summary: 'Create an interview', description: 'Create an interview' })
    @ApiResponse({ status: 201, description: 'Interview created successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    create(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() dto: CreateInterviewDto,
    ) {
        return this.interviewsService.create(companyId, dto);
    }

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
    ) {
        return this.interviewsService.programInterview(companyId, interviewId, dto);
    }

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

    @Patch('/meetings/:meetingId')
    @ApiOperation({ summary: 'Update meeting', description: 'Update meeting' })
    @ApiResponse({ status: 200, description: 'Meeting updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 404, description: 'No meeting found for this meeting ID' })
    updateMeeting(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('meetingId') meetingId: string,
        @Body() dto: UpdateMeetingDto
    ) {
        return this.interviewsService.updateMeeting(companyId, meetingId, dto);
    }
}