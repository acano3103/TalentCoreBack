import { Controller, Patch, Param, Body, ParseIntPipe, UseGuards, Req, Get, UseInterceptors, UploadedFiles, Post, UploadedFile, UsePipes, ValidationPipe } from '@nestjs/common';
import { PostulationsService } from './postulations.service';
import { UpdatePostulationStatusDto } from './dto/update-status.dto';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { CreatePostulationDto } from './dto/create-postulation.dto';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@ApiTags('Postulations')
@ApiBearerAuth()
@Controller('companies/:companyId/postulations')
export class PostulationsController {
    constructor(private readonly service: PostulationsService) { }

    //Endpoint para registrar una postulación, dispara el perfilador de IA para el análisis de CV
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

    // Endpoint para obtener el catalogo de estatus de las postulaciones
    @UseGuards(JwtAuthGuard)
    @Get('/status')
    @ApiOperation({ summary: 'Get the catalog of postulation status', description: 'Get the catalog of postulation status' })
    @ApiResponse({ status: 200, description: 'Postulation status retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async getStatus() {
        return this.service.getStatus();
    }

    // Endpoint para obtener el detalle de una postulación por id
    @UseGuards(JwtAuthGuard)
    @Get('/:postulationId')
    @ApiOperation({ summary: 'Get a postulation by id', description: 'Get a postulation by id' })
    @ApiResponse({ status: 200, description: 'Postulation retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 404, description: 'Postulation not found' })
    async getPostulation(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('postulationId', ParseIntPipe) postulationId: number
    ) {
        return this.service.getPostulation(companyId, postulationId);
    }

    // Endpoint para cambiar el estatus de una postulación por su id
    @UseGuards(JwtAuthGuard)
    @Patch(':postulationId/status')
    @UseInterceptors(FilesInterceptor('company_docs'))
    @ApiOperation({ summary: 'Update the status of a postulation by id', description: 'Update the status of a postulation by id' })
    @ApiResponse({ status: 200, description: 'Postulation status updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 404, description: 'Postulation not found' })
    async updateStatus(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('postulationId', ParseIntPipe) postulationId: number,
        @Body() dto: UpdatePostulationStatusDto,
        @UploadedFiles() files: Express.Multer.File[] = [],
        @GetActiveUser() user: ActiveUserDto
    ) {
        return this.service.updateStatus(companyId, postulationId, dto, user, files);
    }
}