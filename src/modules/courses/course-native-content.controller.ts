import { Body, Controller, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { CourseNativeContentService } from './course-native-content.service';
import { SaveNativeContentDto } from './dto/save-native-content.dto';

@ApiBearerAuth()
@ApiTags('Course Content')
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/courses/sessions/:sessionId/content')
export class CourseNativeContentController {
    constructor(private readonly courseNativeContentService: CourseNativeContentService) { }

    // Endpoint para crear o reemplazar a mano el contenido de una sesión Online Asíncrono (módulos, lecciones y quiz)
    @Put('native')
    @ApiOperation({ summary: 'Create or replace the content of an async session manually', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Content saved' })
    @ApiResponse({ status: 400, description: 'Invalid content, SCORM session, or participants already have progress' })
    @ApiResponse({ status: 404, description: 'Session not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    saveNative(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @Body() saveNativeContentDto: SaveNativeContentDto,
        @GetActiveUser() activeUser: ActiveUserDto,
    ) {
        return this.courseNativeContentService.saveNative(companyId, sessionId, saveNativeContentDto, activeUser);
    }
}
