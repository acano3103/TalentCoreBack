import { Controller, Get, Param, ParseIntPipe, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../../../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../../../auth/dto/active-user.dto';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { CourseCertificateService } from './course-certificate.service';

@ApiBearerAuth()
@ApiTags('My Courses')
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/my-courses')
export class CourseCertificateController {
    constructor(private readonly certificateService: CourseCertificateService) { }

    @Get(':sessionId/certificate')
    @ApiOperation({ summary: 'Download the completion certificate of an approved course (PDF)', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'PDF file' })
    @ApiResponse({ status: 400, description: 'The course is not approved yet' })
    @ApiResponse({ status: 404, description: 'Course not assigned to the employee' })
    async download(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('sessionId', ParseIntPipe) sessionId: number,
        @GetActiveUser() user: ActiveUserDto,
        @Res() res: Response,
    ) {
        const { buffer, fileName } = await this.certificateService.getMyCertificate(companyId, sessionId, user);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Length': buffer.length.toString(),
        });
        res.end(buffer);
    }
}
