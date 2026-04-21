import { Controller, Patch, Param, Body } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { ValidatePositionDto } from './dto/approve-reject.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Positions')
@Controller('companies/:companyId/positions')
export class PositionsController {
    constructor(private readonly service: PositionsService) { }

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