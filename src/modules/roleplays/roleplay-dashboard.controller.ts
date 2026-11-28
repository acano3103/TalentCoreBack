import { Controller, Get, Param, ParseIntPipe, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { ExcelExportService } from 'src/common/services/excel-export.service';
import { RoleplayDashboardService } from './roleplay-dashboard.service';
import { RoleplayDashboardQueryDto } from './dto/roleplay-dashboard.dto';

@ApiBearerAuth()
@ApiTags('Training Dashboard - Roleplays')
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/training-dashboard/roleplays')
export class RoleplayDashboardController {
    constructor(
        private readonly dashboardService: RoleplayDashboardService,
        private readonly excelExportService: ExcelExportService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Role play results for the training dashboard', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'KPIs and one row per role play' })
    summary(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: RoleplayDashboardQueryDto,
    ) {
        return this.dashboardService.summary(companyId, user, query);
    }

    @Get('export')
    @ApiOperation({ summary: 'Export role play results to Excel', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Excel file generated successfully' })
    async export(
        @GetActiveUser() user: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: RoleplayDashboardQueryDto,
        @Res() res: Response,
    ) {
        const buffer = await this.dashboardService.export(companyId, user, query);
        this.excelExportService.send(res, buffer, 'Roleplays_Capacitacion');
    }
}
