import { Controller, Patch, Param, Body, ParseIntPipe, UseGuards, Req, Get, UseInterceptors, UploadedFiles, Post, UploadedFile, UsePipes, ValidationPipe } from '@nestjs/common';
import { PostulationsService } from './postulations.service';
import { UpdatePostulationStatusDto } from './dto/update-status.dto';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { CreatePostulationDto } from './dto/create-postulation.dto';

@ApiTags('Postulations')
@ApiBearerAuth()
@Controller('companies/:companyId/postulations')
export class PostulationsController {
    constructor(private readonly service: PostulationsService) { }

    @Post()
    @UseInterceptors(FileInterceptor('cv'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Register a postulant', description: 'Register a postulant and save the cv in teh server' })
    @ApiResponse({ status: 200, description: 'Postulation registed successfully.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async registerCandidate(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() body: CreatePostulationDto,
        @UploadedFile() file: Express.Multer.File
    ) {
        return await this.service.createPostulation(companyId, body, file);
    }

    @UseGuards(JwtAuthGuard)
    @Get('/status')
    @ApiOperation({ summary: 'Get the status of postulations', description: 'Get the status of postulations' })
    @ApiResponse({ status: 200, description: 'Postulation status retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async getStatus() {
        return this.service.getStatus();
    }

    @UseGuards(JwtAuthGuard)
    @Patch(':postulationId/status')
    @UseInterceptors(FilesInterceptor('company_docs'))
    @ApiOperation({ summary: 'Update the status of a postulation', description: 'Update the status of a postulation' })
    @ApiResponse({ status: 200, description: 'Postulation status updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 404, description: 'Postulation not found' })
    async updateStatus(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('postulationId', ParseIntPipe) postulationId: number,
        @Body() dto: UpdatePostulationStatusDto,
        @UploadedFiles() files: Express.Multer.File[] = [],
        @CurrentUser() user: any
    ) {
        return this.service.updateStatus(companyId, postulationId, dto, user, files);
    }
}