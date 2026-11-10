import { Controller, Post, Param, UseInterceptors, UploadedFiles, Body } from '@nestjs/common';
import { HumeService } from './hume.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

@ApiTags('Integrations')
@Controller('integrations/hume')
export class HumeController {
    constructor(private readonly humeService: HumeService) { }

    @Post(':interviewId/token')
    @ApiOperation({ summary: 'Get Hume token', description: 'Get Hume token' })
    @ApiResponse({ status: 201, description: 'Hume token successfully retrieved.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    async getToken(@Param('interviewId') interviewId: string) {
        return await this.humeService.getHumeSession(interviewId);
    }

    @Post(':interviewId/analyze')
    @ApiOperation({ summary: 'Analyze interview', description: 'Analyze interview' })
    @ApiResponse({ status: 201, description: 'Interview analyzed successfully.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    @UseInterceptors(FileFieldsInterceptor([
        { name: 'video', maxCount: 1 },
    ]))
    async finalizarEntrevista(
        @Param('interviewId') interviewId: string,
        @UploadedFiles() files: { video?: Express.Multer.File[] },
        @Body() body: any,
    ) {
        const { conversationHistory, emotionSummary } = body;

        return this.humeService.processHumeAnalysis(
            interviewId,
            files.video?.[0],
            conversationHistory,
            emotionSummary
        );
    }
}