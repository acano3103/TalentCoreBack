import { Controller, Get, Param, ParseIntPipe, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../../auth/dto/active-user.dto';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { CourseMaterialsService, MaterialSubido } from './course-materials.service';
import { MATERIAL_MAX_BYTES } from './course-materials.constants';

@ApiBearerAuth()
@ApiTags('Course Materials')
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId')
export class CourseMaterialsController {
    constructor(private readonly courseMaterialsService: CourseMaterialsService) { }

    @Post('courses/sessions/:sessionId/content/materials')
    @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MATERIAL_MAX_BYTES } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } } } })
    @ApiOperation({ summary: 'Upload a support material file for the lessons of an async session', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 201, description: 'File uploaded; returns the material to add to a lesson' })
    @ApiResponse({ status: 400, description: 'Format or size not allowed' })
    upload(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @UploadedFile() archivo: MaterialSubido,
        @GetActiveUser() activeUser: ActiveUserDto,
    ) {
        return this.courseMaterialsService.upload(companyId, sessionId, archivo, activeUser);
    }

    @Get('courses/sessions/:sessionId/content/materials/:archivo')
    @ApiOperation({ summary: 'Serve a support material (admin preview)', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 404, description: 'File not found' })
    async adminFile(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @Param('archivo') archivo: string,
        @GetActiveUser() activeUser: ActiveUserDto,
        @Res() res: Response,
    ) {
        await this.courseMaterialsService.sendForAdmin(companyId, sessionId, archivo, activeUser, res);
    }

    @Get('my-courses/:sessionId/materials/:archivo')
    @ApiOperation({ summary: 'Serve a support material to the enrolled employee', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 404, description: 'File not found or not part of the course' })
    async employeeFile(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @Param('archivo') archivo: string,
        @GetActiveUser() activeUser: ActiveUserDto,
        @Res() res: Response,
    ) {
        await this.courseMaterialsService.sendForEmployee(companyId, sessionId, archivo, activeUser, res);
    }
}
