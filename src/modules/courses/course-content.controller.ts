import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { CourseContentService } from './course-content.service';
import { GenerateAiContentDto } from './dto/generate-ai-content.dto';
import { UpdateContentConfigDto } from './dto/update-content-config.dto';

@ApiBearerAuth()
@ApiTags('Course Content')
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/courses/sessions/:sessionId/content')
export class CourseContentController {
    constructor(private readonly courseContentService: CourseContentService) { }

    // Endpoint para generar (o regenerar) con IA el contenido de una sesión Online Asíncrono
    @Post('generate-ai')
    @ApiOperation({ summary: 'Generate the content of an async session with AI', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Content generated successfully' })
    @ApiResponse({ status: 400, description: 'Bad Request. Session is not async, no AI integration, or participants already have progress.' })
    @ApiResponse({ status: 404, description: 'Session not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    generateWithAi(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @Body() generateAiContentDto: GenerateAiContentDto,
        @GetActiveUser() activeUser: ActiveUserDto,
    ) {
        return this.courseContentService.generateWithAi(companyId, sessionId, generateAiContentDto, activeUser);
    }

    // Endpoint para obtener el contenido completo de una sesión (módulos y lecciones)
    @Get()
    @ApiOperation({ summary: 'Get the content of an async session (modules and lessons)', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Content found (contenido is null when the session has no content yet)' })
    @ApiResponse({ status: 404, description: 'Session not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    findContent(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @GetActiveUser() activeUser: ActiveUserDto,
    ) {
        return this.courseContentService.findContent(companyId, sessionId, activeUser);
    }

    // Endpoint para cambiar la configuración de avance del contenido
    @Patch()
    @ApiOperation({ summary: 'Update the progress mode of the session content', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Content configuration updated successfully' })
    @ApiResponse({ status: 404, description: 'Session or content not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    updateConfig(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @Body() updateContentConfigDto: UpdateContentConfigDto,
        @GetActiveUser() activeUser: ActiveUserDto,
    ) {
        return this.courseContentService.updateConfig(companyId, sessionId, updateContentConfigDto, activeUser);
    }
}
