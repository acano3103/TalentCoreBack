import { Controller, Get, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { VencimientosDashboardService } from './vencimientos-dashboard.service';

@ApiTags('Vencimientos Dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('companies/:companyId/digital-files/vencimientos-dashboard')
export class VencimientosDashboardController {
    constructor(private readonly service: VencimientosDashboardService) { }

    @Get()
    @ApiOperation({ summary: 'Get vencimientos dashboard data', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Dashboard data obtained successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized: Token is missing or invalid' })
    @ApiQuery({ name: 'idArea', required: false, type: Number })
    @ApiQuery({ name: 'idSite', required: false, type: Number })
    @ApiQuery({ name: 'idPuesto', required: false, type: Number })
    @ApiQuery({ name: 'estado', required: false, enum: ['vigente', 'por_vencer', 'vencido'] })
    @ApiQuery({ name: 'fechaDesde', required: false, type: String })
    @ApiQuery({ name: 'fechaHasta', required: false, type: String })
    async getDashboard(
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query('idArea') idArea?: string,
        @Query('idSite') idSite?: string,
        @Query('idPuesto') idPuesto?: string,
        @Query('estado') estado?: 'vigente' | 'por_vencer' | 'vencido',
        @Query('fechaDesde') fechaDesde?: string,
        @Query('fechaHasta') fechaHasta?: string,
    ) {
        return this.service.getVencimientosDashboard(companyId, {
            idArea: idArea ? Number(idArea) : undefined,
            idSite: idSite ? Number(idSite) : undefined,
            idPuesto: idPuesto ? Number(idPuesto) : undefined,
            estado,
            fechaDesde,
            fechaHasta,
        });
    }
}