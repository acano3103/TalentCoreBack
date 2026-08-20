import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { ConnectIntegrationDto } from './dto/connect-integration.dto';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

@ApiTags('Integrations')
@ApiBearerAuth()
@Controller('companies/:companyId/integrations')
export class IntegrationsController {
    constructor(private readonly service: IntegrationsService) { }

    // Endpoint para obtener todas las integraciones de una empresa
    @UseGuards(JwtAuthGuard)
    @Get()
    @ApiOperation({ summary: 'Get all integrations', description: 'Get all integrations for a company' })
    @ApiResponse({ status: 201, description: 'List of integrations' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    getIntegrations(@Param('companyId') companyId: number) {
        return this.service.getIntegrations(companyId);
    }

    // Endpoint para conectar una integración por proveedor id
    @UseGuards(JwtAuthGuard)
    @Post(':providerId')
    @ApiOperation({ summary: 'Connect an integration', description: 'Connect an integration to a company' })
    @ApiResponse({ status: 201, description: 'Integration successfully connected.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    connect(
        @Param('companyId') companyId: number,
        @Param('providerId') providerId: number,
        @Body() dto: ConnectIntegrationDto,
    ) {
        return this.service.connect(companyId, providerId, dto);
    }

    // Endpoint para desconectar una integración por proveedor id
    @UseGuards(JwtAuthGuard)
    @Delete(':providerId')
    @ApiOperation({ summary: 'Disconnect an integration', description: 'Disconnect an integration from a company' })
    @ApiResponse({ status: 201, description: 'Integration successfully disconnected.' })
    @ApiResponse({ status: 401, description: 'Unauthorized. Invalid credentials.' })
    @ApiResponse({ status: 400, description: 'Bad Request. Validation errors.' })
    disconnect(
        @Param('companyId') companyId: number,
        @Param('providerId') providerId: number,
    ) {
        return this.service.disconnect(companyId, providerId);
    }
}