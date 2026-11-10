import { Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ActivityLogsService } from './activity-logs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';

@ApiTags('activity-logs')
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/activity-logs')
export class ActivityLogsController {

    constructor(
        private readonly service: ActivityLogsService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Get all activity logs', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Activity logs obtained successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getActivityLogs(
        @Query('originTable') originTable: string,
        @Query('recordId',) recordId: string,
    ) {
        return this.service.getActivityLogs(originTable, recordId);
    }
}
