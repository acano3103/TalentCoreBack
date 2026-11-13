import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ActivateKioskDto } from './dto/activate-kiosk.dto';
import { KioskActivationService } from './kiosk-activation.service';
import { ipDeSolicitud } from './kiosk-activation-rate-limiter';

@ApiTags('Kiosk')
@Controller('kiosk')
export class KioskAuthController {
    constructor(private readonly activation: KioskActivationService) {}

    @Post('activate')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Activar un kiosco',
        description:
            'Público. El equipo escanea el código del QR (o lo teclea). Devuelve el token del kiosco una sola vez por código.',
    })
    @ApiBody({ type: ActivateKioskDto })
    @ApiResponse({ status: 200, description: 'Equipo activado. El token identifica al kiosco.' })
    @ApiResponse({ status: 400, description: 'Código inválido, vencido o bloqueado.' })
    @ApiResponse({ status: 409, description: 'Modalidad no disponible o el equipo ya está activado.' })
    @ApiResponse({ status: 429, description: 'Demasiados intentos desde esta red.' })
    activate(@Body() dto: ActivateKioskDto, @Req() req: Request) {
        return this.activation.activate(dto, ipDeSolicitud(req));
    }
}
