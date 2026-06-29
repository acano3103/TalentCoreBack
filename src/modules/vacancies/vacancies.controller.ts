import { Controller, Get, Post, Put, Patch, Body, Param, Query, ParseIntPipe, UseGuards, DefaultValuePipe } from '@nestjs/common';
import { VacanciesService } from './vacancies.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { GetActiveUser } from '../auth/decorators/active-user.decorator';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@ApiTags('Vacancies')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('companies/:companyId/vacancies')
export class VacanciesController {
    constructor(private readonly vacanciesService: VacanciesService) { }

    //      SECCIÓN 1: VACANTES

    @Get()
    async getActiveVacancies(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number
    ) {
        return this.vacanciesService.findActiveVacancies(companyId, activeUser);
    }

    //      SECCIÓN 2: REQUISICIONES (SOLICITUDES)

    @Get('requisitions')
    @ApiOperation({ summary: 'Get all requisitions', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Requisitions obtained successfully' })
    @ApiResponse({ status: 404, description: 'Requisitions not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    async getRequisitions(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('search') search?: string
    ) {
        const querySearch = search || '';
        return this.vacanciesService.findAllRequisitions(companyId, page, querySearch, limit, activeUser);
    }

    @Post('requisitions')
    async createRequisition() {
        return this.vacanciesService.createRequisition();
    }

    @Put('requisitions/:id')
    async updateRequisition(
    ) {
        return this.vacanciesService.updateRequisition();
    }

    @Patch('requisitions/:id/status')
    async changeRequisitionStatus(
    ) {
        return this.vacanciesService.changeStatus();
    }
}
