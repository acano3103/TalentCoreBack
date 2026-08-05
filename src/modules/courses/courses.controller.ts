import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe, DefaultValuePipe, Query, Put } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreateCourseSessionDto } from './dto/create-course-session.dto';
import { AssignParticipantsDto } from './dto/assign-participants.dto';

@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiTags('Courses')
@Controller('companies/:companyId/courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) { }

  // Endpoint para sincronizar/guardar los participantes inscritos en una sesión
  @Post('sessions/:sessionId/participants')
  @ApiOperation({ summary: 'Assign/sync participants for a course session', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Participants updated successfully' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  assignParticipants(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() assignParticipantsDto: AssignParticipantsDto,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.coursesService.assignParticipants(companyId, sessionId, assignParticipantsDto, activeUser);
  }

  // Endpoint para crear/programar una nueva sesión de curso
  @Post('sessions')
  @ApiOperation({ summary: 'Create a new course session/programming', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 201, description: 'Course session created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  createSession(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() createCourseSessionDto: CreateCourseSessionDto,
    @GetActiveUser() activeUser: ActiveUserDto,
  ) {
    return this.coursesService.createSession(companyId, createCourseSessionDto, activeUser);
  }

  // Enpoint para crear un nuevo curso en el catalogo
  @Post()
  @ApiOperation({ summary: 'Create a new course', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Course created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  create(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() createCourseDto: CreateCourseDto,
    @GetActiveUser() activeUser: ActiveUserDto
  ) {
    return this.coursesService.create(companyId, createCourseDto, activeUser);
  }

  // Endpoint para obtener todos los cursos paginados de una empresa en especifico
  @Get()
  @ApiOperation({ summary: 'Get all courses for a company', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'List of courses for a company' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name or tipe' })
  findAll(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.coursesService.findAll(companyId, page, limit, search || '');
  }

  // Endpoint para obtener un curso por id
  @Get(':courseId')
  @ApiOperation({ summary: 'Get course by id', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Course found' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  findOne(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('courseId', ParseIntPipe) courseId: number) {
    return this.coursesService.findOne(companyId, courseId);
  }

  // Endpoint para obtener el detalle de una sesión por su ID
  @Get('sessions/:sessionId')
  @ApiOperation({ summary: 'Get details of a specific course session', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Course session details found' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  findSessionById(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.coursesService.findSessionById(companyId, sessionId);
  }

  // Endpoint para obtener todas las sesiones de un curso en específico (paginado)
  @Get(':courseId/sessions')
  @ApiOperation({ summary: 'Get all sessions for a specific course', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'List of sessions for the course' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by location, link or instructor' })
  findSessionsByCourse(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.coursesService.findSessionsByCourse(companyId, courseId, page, limit, search || '');
  }

  // Endpoint que elimina una sesión programada de un curso
  @Delete('sessions/:sessionId')
  @ApiOperation({ summary: 'Delete a scheduled session from a course', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Session deleted successfully' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async deleteSession(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @GetActiveUser() activeUser: ActiveUserDto
  ) {
    return this.coursesService.deleteSession(companyId, sessionId, activeUser);
  }

  // Endpoint que desactiva un curso
  @Delete('/:courseId')
  @ApiOperation({ summary: 'Disable course', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Course disabled successfully' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async disable(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('courseId', ParseIntPipe) courseId: number,
    @GetActiveUser() activeUser: ActiveUserDto
  ) {
    return this.coursesService.changeStatus(companyId, courseId, false, activeUser);
  }

  // Endpoint que reactiva un curso
  @Patch('/:courseId/reactivate')
  @ApiOperation({ summary: 'Reactivate course', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Course reactivated successfully' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async reactivate(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('courseId', ParseIntPipe) courseId: number,
    @GetActiveUser() activeUser: ActiveUserDto
  ) {
    return this.coursesService.changeStatus(companyId, courseId, true, activeUser);
  }

  // Endpoint para actualizar un curso
  @Put(':courseId')
  @ApiOperation({ summary: 'Update course', description: SWAGGER_AUTH_DESCRIPTION })
  @ApiResponse({ status: 200, description: 'Course updated successfully' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
  async update(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() updateCourseDto: UpdateCourseDto,
    @GetActiveUser() activeUser: ActiveUserDto
  ) {
    return this.coursesService.update(companyId, courseId, updateCourseDto, activeUser);
  }
}
