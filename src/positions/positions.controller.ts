import { Controller, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { ValidatePositionDto } from './dto/approve-reject.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ModulesGuard } from 'src/auth/guards/modules.guard';
import { Modules } from 'src/auth/decorators/modules.decorator';

@ApiTags('Positions')
@Controller('companies/:companyId/positions')
export class PositionsController {
    constructor(private readonly service: PositionsService) { }

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