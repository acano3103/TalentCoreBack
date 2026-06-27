import { Controller, Patch, Get, Param, Body, UseGuards, Query, Req } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { ValidatePositionDto } from './dto/approve-reject.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@ApiTags('Positions')
@ApiBearerAuth()
@Controller('companies/:companyId/positions')
export class PositionsController {
    constructor(private readonly service: PositionsService) { }

    @UseGuards(JwtAuthGuard)
    @Get()
    @ApiOperation({
        summary: 'Get all positions',
        description: 'Returns all positions for a company, optionally filtered by status (e.g., active, inactive).'
    })
    @ApiQuery({
        name: 'status',
        required: false,
        type: String,
        description: 'Filter positions by status (active, inactive). If omitted, returns all positions.'
    })
    @ApiResponse({ status: 200, description: 'Positions successfully retrieved.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    async getPositions(@Param('companyId') companyId: number, @Req() req: any, @Query('status') status?: string) {
        return this.service.findAllPositions(Number(companyId), req.user, status);
    }

    @UseGuards(JwtAuthGuard)
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