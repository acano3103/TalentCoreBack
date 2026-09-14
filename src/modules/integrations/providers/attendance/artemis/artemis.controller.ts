import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ArtemisService } from './artemis.service';
import { ArtemisClockInDto } from './dto/artemis-clock-in.dto';
import { ArtemisApiKeyGuard } from './guards/artemis-api-key.guard';

@ApiTags('Artemis Attendance')
@ApiSecurity('x-api-key')
@UseGuards(ArtemisApiKeyGuard)
@Controller('integrations/attendance/artemis')
export class ArtemisController {
    constructor(private readonly artemisService: ArtemisService) { }

    // This endpoint is called by the Artemis system to clock in an employee
    @Post('clock-in')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Clock in employee for Artemis', description: 'Receives the digits marked by phone, checks that the employee exists and is active in the company.' })
    @ApiResponse({ status: 200, description: 'Employee clock in successfully.' })
    @ApiResponse({ status: 404, description: 'Employee not found or inactive.' })
    async clockIn(@Body() dto: ArtemisClockInDto) {
        return this.artemisService.clockIn(dto);
    }
}