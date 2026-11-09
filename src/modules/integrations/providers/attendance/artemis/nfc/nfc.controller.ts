import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { NfcService } from './nfc.service';
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ArtemisApiKeyGuard } from '../guards/artemis-api-key.guard';
import { LocationEmployeesRequestDto } from './dto/location-employees-request.dto';

@ApiTags('Artemis Attendance')
@ApiSecurity('x-api-key')
@UseGuards(ArtemisApiKeyGuard)
@Controller('integrations/attendance/artemis/nfc')
export class NfcController {
  constructor(private readonly nfcService: NfcService) { }

  @Post('employees')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get authorized employees by location', description: 'Retrieves all active employees authorized to register attendance through NFC at the specified location.' })
  @ApiBody({ type: LocationEmployeesRequestDto })
  @ApiResponse({ status: 200, description: 'Authorized employees retrieved successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid request data.' })
  @ApiResponse({ status: 401, description: 'Unauthorized. Invalid API key.' })
  getEmployeesByLocation(@Body() body: LocationEmployeesRequestDto) {
    return this.nfcService.getEmployeesByLocation(body);
  }
}
