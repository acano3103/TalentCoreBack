import { Controller, Patch, Get, Param, Body, UseGuards } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { ValidatePositionDto } from './dto/approve-reject.dto';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@ApiTags('Positions')
@ApiBearerAuth()
@Controller('companies/:companyId/positions')
export class PositionsController {
    constructor(private readonly service: PositionsService) { }

    @Get(':positionId')
    @ApiOperation({ summary: 'Get position', description: 'Returns a position.' })
    @ApiResponse({ status: 200, description: 'Position successfully retrieved.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async getPosition(@Param('companyId') companyId: number, @Param('positionId') positionId: number) {
        return this.service.findPositionById(companyId, positionId);
    }

    @UseGuards(JwtAuthGuard)
    @Get(':positionId/summary')
    @ApiOperation({ summary: 'Get summary of postulants for a specific position' })
    @ApiResponse({ status: 200, description: 'Position summary obtained successfully.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async getSummary(@Param('positionId') positionId: string) {
        return await this.service.getPostulantsSummary(parseInt(positionId));
    }

    @UseGuards(JwtAuthGuard)//@UseGuards(JwtAuthGuard, ModulesGuard)
    //@Modules('Administrador')
    @Patch(':positionId')
    @ApiOperation({ summary: 'Validate a position', description: 'Validates a position and public it.' })
    @ApiResponse({ status: 201, description: 'Position successfully validated.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    async approveOrReject(
        @Param('companyId') companyId: number,
        @Param('positionId') positionId: number,
        @Body() dto: ValidatePositionDto
    ) {
        return this.service.approveOrReject(companyId, positionId, dto);
    }
}