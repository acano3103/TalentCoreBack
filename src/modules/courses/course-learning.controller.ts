import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { CourseLearningService } from './course-learning.service';
import { SubmitLessonProgressDto } from './dto/submit-lesson-progress.dto';

// Endpoints del empleado logueado: sus cursos Online Asíncrono asignados, tomarlos y guardar su avance
@ApiBearerAuth()
@ApiTags('My Courses')
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/my-courses')
export class CourseLearningController {
    constructor(private readonly courseLearningService: CourseLearningService) { }

    // Endpoint para listar los cursos Online Asíncrono asignados al empleado logueado
    @Get()
    @ApiOperation({ summary: 'List the async courses assigned to the logged employee', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Assigned courses with progress' })
    @ApiResponse({ status: 404, description: 'The user has no employee in this company' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    findMine(
        @Param('companyId', ParseIntPipe) companyId: number,
        @GetActiveUser() activeUser: ActiveUserDto,
    ) {
        return this.courseLearningService.findMyCourses(companyId, activeUser);
    }

    // Endpoint para abrir un curso asignado (lecciones y quiz SIN respuestas correctas)
    @Get(':sessionId')
    @ApiOperation({ summary: 'Get an assigned async course to take it (quiz without answers)', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Course with modules, lessons and the employee progress' })
    @ApiResponse({ status: 404, description: 'Course not assigned to the employee' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    findOne(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @GetActiveUser() activeUser: ActiveUserDto,
    ) {
        return this.courseLearningService.findMyCourse(companyId, sessionId, activeUser);
    }

    // Endpoint para completar una lección: califica el quiz en el servidor y guarda el avance
    @Post(':sessionId/lessons/:lessonId/progress')
    @ApiOperation({ summary: 'Complete a lesson: grades the quiz on the server and saves progress', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Progress saved' })
    @ApiResponse({ status: 400, description: 'Invalid answers, lesson locked or course not available' })
    @ApiResponse({ status: 404, description: 'Course or lesson not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    submitProgress(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @Param('lessonId', ParseIntPipe) lessonId: number,
        @Body() submitLessonProgressDto: SubmitLessonProgressDto,
        @GetActiveUser() activeUser: ActiveUserDto,
    ) {
        return this.courseLearningService.submitLessonProgress(companyId, sessionId, lessonId, submitLessonProgressDto, activeUser);
    }
}
