import { Controller, Get, Param, Res, UseGuards, StreamableFile } from '@nestjs/common';
import { MediaService } from './media.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
    constructor(private readonly mediaService: MediaService) { }

    @UseGuards(JwtAuthGuard)
    @Get('*datasource')
    @ApiOperation({
        summary: 'Securely obtain any private file',
        description: 'It dynamically serves any resource from the src/media folder by validating the token and protecting the system from Path Traversal.'
    })
    @ApiResponse({ status: 200, description: 'File obtained successfully.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async getPrivateFile(
        @Param() params: any,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        let fileRelativePath = params.datasource;
        if (Array.isArray(fileRelativePath)) fileRelativePath = fileRelativePath.join('/');
        return this.mediaService.getPrivateFileGeneric(fileRelativePath, res);
    }
}
