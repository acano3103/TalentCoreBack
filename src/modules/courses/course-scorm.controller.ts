import { Body, Controller, Get, Param, ParseIntPipe, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { ArchivoSubido, CourseScormService } from './course-scorm.service';
import { CommitScormDto } from './dto/commit-scorm.dto';

@ApiBearerAuth()
@ApiTags('Course SCORM')
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId')
export class CourseScormController {
    constructor(private readonly courseScormService: CourseScormService) { }


    @Post('courses/sessions/:sessionId/content/scorm')
    @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 200 * 1024 * 1024 } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } } } })
    @ApiOperation({ summary: 'Upload the SCORM 1.2 / 2004 package (.zip) of an async session', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Package uploaded' })
    @ApiResponse({ status: 400, description: 'Invalid package or participants already have progress' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    upload(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @UploadedFile() archivo: ArchivoSubido,
        @GetActiveUser() activeUser: ActiveUserDto,
    ) {
        return this.courseScormService.uploadPackage(companyId, sessionId, archivo, activeUser);
    }

    @Get('courses/sessions/:sessionId/scorm/files/*path')
    @ApiOperation({ summary: 'Serve a file of the SCORM package', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'File content' })
    @ApiResponse({ status: 404, description: 'File not found' })
    async file(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @Param('path') path: string | string[],
        @GetActiveUser() activeUser: ActiveUserDto,
        @Res() res: Response,
    ) {
        const filePath = Array.isArray(path) ? path.join('/') : path;
        await this.courseScormService.sendFile(companyId, sessionId, filePath, activeUser, res);
    }

    @Get('my-courses/:sessionId/scorm')
    @ApiOperation({ summary: 'Launch data and saved state of the SCORM course for the logged employee', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Launch URL, SCORM version and saved cmi values' })
    @ApiResponse({ status: 404, description: 'Course not assigned to the employee' })
    launch(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @GetActiveUser() activeUser: ActiveUserDto,
    ) {
        return this.courseScormService.getLaunch(companyId, sessionId, activeUser);
    }

    @Post('my-courses/:sessionId/scorm/commit')
    @ApiOperation({ summary: 'Save the cmi values reported by the SCORM package', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'Progress saved' })
    @ApiResponse({ status: 400, description: 'The course has no SCORM package' })
    commit(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @Body() dto: CommitScormDto,
        @GetActiveUser() activeUser: ActiveUserDto,
    ) {
        return this.courseScormService.commit(companyId, sessionId, dto, activeUser);
    }
}
