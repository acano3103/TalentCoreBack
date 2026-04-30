import { Controller, Patch, Param, Body, ParseIntPipe, UseGuards, Req, Get } from '@nestjs/common';
import { PostulationsService } from './postulations.service';
import { UpdatePostulationStatusDto } from './dto/update-status.dto';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@ApiTags('Postulations')
@ApiBearerAuth()
@Controller('companies/:companyId/postulations')
export class PostulationsController {
    constructor(private readonly service: PostulationsService) { }

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
    @ApiOperation({ summary: 'Update the status of a postulation', description: 'Update the status of a postulation' })
    @ApiResponse({ status: 200, description: 'Postulation status updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 404, description: 'Postulation not found' })
    async updateStatus(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Param('postulationId', ParseIntPipe) postulationId: number,
        @Body() dto: UpdatePostulationStatusDto,
        @CurrentUser() user: any
    ) {
        return this.service.updateStatus(companyId, postulationId, dto, user);
    }
}