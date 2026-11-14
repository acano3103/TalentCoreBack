import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
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
        description: 'Gupshup avisa si el mensaje se entregó o falló. No usa JWT: valida la clave compartida.',
    })
    @ApiResponse({ status: 200, description: 'Estado aplicado.' })
    @ApiResponse({ status: 401, description: 'FIRMA_INVALIDA.' })
    estado(
        @Headers() headers: Record<string, string | string[] | undefined>,
        @Body() body: Record<string, unknown>,
    ) {
        return this.service.aplicar(headers, body);
    }
}
