import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ArtemisApiKeyGuard } from './guards/artemis-api-key.guard';
import { ArtemisService } from './artemis.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Artemis')
@Controller('integrations/artemis')
@UseGuards(ArtemisApiKeyGuard)
export class ArtemisController {
    constructor(
        private readonly artemisService: ArtemisService,
    ) { }

    @Get('/positions')
    @ApiOperation({ summary: 'Get all positions by company id' })
    @ApiResponse({ status: 200, description: 'Positions obtained successfully.' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    async getPositions() {
        return await this.artemisService.getPositions();
    }
}