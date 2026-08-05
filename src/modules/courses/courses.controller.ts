import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe, DefaultValuePipe, Query, Put } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiTags('Courses')
@Controller('companies/:companyId/courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) { }

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
