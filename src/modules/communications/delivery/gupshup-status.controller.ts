import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GupshupStatusService } from './gupshup-status.service';

@ApiTags('Integraciones')
@Controller('integrations/whatsapp/gupshup')
export class GupshupStatusController {
    constructor(private readonly service: GupshupStatusService) {}

    @Post('status')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Estado de un mensaje de WhatsApp',
        description: 'Gupshup avisa si el mensaje se entregó o falló. No usa JWT: valida GUPSHUP_WEBHOOK_SECRET en el encabezado o en ?token=.',
    })
    @ApiResponse({ status: 200, description: 'Estado aplicado.' })
    @ApiResponse({ status: 401, description: 'FIRMA_INVALIDA.' })
    @ApiResponse({ status: 503, description: 'WEBHOOK_NO_CONFIGURADO.' })
    estado(
        @Headers() headers: Record<string, string | string[] | undefined>,
        @Body() body: Record<string, unknown>,
        @Query('token') token?: string,
    ) {
        return this.service.aplicar(headers, body, token);
    }
}
