import { Controller, Post, Get, Body, Param, UseGuards, ParseIntPipe, Query } from '@nestjs/common';
import { InterviewsService } from './interviews.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

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
    findAllByMainInterview(@Param('interviewId') interviewId: string) {
        return this.interviewsService.findAllByMainInterview(interviewId);
    }

    @UseGuards(JwtAuthGuard)
    @Post('/:positionId')
    @ApiOperation({ summary: 'Create an interview', description: 'Create an interview' })
    @ApiResponse({ status: 201, description: 'Interview created successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    create(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('positionId', ParseIntPipe) positionId: number,
        @Body() dto: CreateInterviewDto,
    ) {
        return this.interviewsService.create(companyId, positionId, dto);
    }

    // @UseGuards(JwtAuthGuard)
    // @Post('/:providerId')
    // @ApiOperation({ summary: 'Create an interview', description: 'Create an interview' })
    // @ApiResponse({ status: 201, description: 'Interview created successfully' })
    // @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    // @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    // create(
    //     @Param('companyId', ParseIntPipe) companyId: number,
    //     @Param('providerId', ParseIntPipe) providerId: number,
    //     @Body() dto: CreateInterviewDto,
    // ) {
    //     return this.interviewsService.create(companyId, providerId, dto);
    // }

    // @UseGuards(JwtAuthGuard)
    // @Get('candidate/:candidateId')
    // @ApiOperation({ summary: 'Get all interviews for a candidate', description: 'Get all interviews for a candidate' })
    // @ApiResponse({ status: 200, description: 'List of interviews for a candidate' })
    // @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    // @ApiResponse({ status: 404, description: 'No interviews found for this candidate' })
    // findByCandidate(@Param('candidateId', ParseIntPipe) candidateId: number) {
    //     return this.interviewsService.findAllByCandidate(candidateId);
    // }
}
