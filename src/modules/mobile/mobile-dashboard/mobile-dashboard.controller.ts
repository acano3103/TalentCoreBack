import { Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MobileDashboardService } from './mobile-dashboard.service';
import { MobileJwtAuthGuard } from '../mobile-auth/guards/mobile-jwt-auth.guard';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';

@ApiTags('Mobile Dashboard')
@ApiBearerAuth()
@UseGuards(MobileJwtAuthGuard)
@Controller('mobile/companies/:companyId/dashboard')
export class MobileDashboardController {
    constructor(private readonly dashboardService: MobileDashboardService) { }

    @Get()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Obtain summary data of the dashboard.', description: 'Validate the mobile Bearer Token and return sample data of the active user and database.', })
    @ApiResponse({ status: 200, description: 'Dashboard summary loaded successfully', })
    @ApiResponse({ status: 401, description: 'Invalid or expired token', })
    async getSummary(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
    ) {
        return this.dashboardService.getSummary(activeUser, companyId);
    }
}
