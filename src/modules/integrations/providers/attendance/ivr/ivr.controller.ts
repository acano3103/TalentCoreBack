import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { VerifyEmployeeIvrDto } from './dto/verify-employee-ivr.dto';
import { IvrService } from './ivr.service';
import { IvrApiKeyGuard } from './guards/ivr-api-key.guard';

@ApiTags('IVR Attendance')
@ApiSecurity('IVR-ApiKey')
@UseGuards(IvrApiKeyGuard)
@Controller('integrations/attendance/ivr')
export class IvrController {
    constructor(private readonly ivrService: IvrService) { }

    // This endpoint is called by the IVR system to verify the employee
    @Post('verify-employee')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Verify employee for IVR', description: 'Receives the digits marked by phone, checks that the employee exists and is active in the company.' })
    @ApiResponse({ status: 200, description: 'Employee found and active.' })
    @ApiResponse({ status: 404, description: 'Employee not found or inactive.' })
    async verifyEmployee(@Body() dto: VerifyEmployeeIvrDto) {
        return this.ivrService.verifyEmployee(dto);
    }
}
