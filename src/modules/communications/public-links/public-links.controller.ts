import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { contextoCliente, SolicitudCliente } from '../me/cliente-http';
import { VerificarEnlaceDto } from './dto/verificar-enlace.dto';
import { LinkThrottleGuard } from './link-throttle.guard';
import { PublicLinksService } from './public-links.service';

@ApiTags('Comunicación interna')
@UseGuards(LinkThrottleGuard)
@Controller('public/comms/links')
export class PublicLinksController {
    constructor(private readonly service: PublicLinksService) {}

    @Get(':token')
    @ApiOperation({
        summary: 'Metadatos del enlace seguro',
        description: 'No incluye el cuerpo. 20 solicitudes por minuto por IP y 10 por token.',
    })
    @ApiResponse({ status: 200, description: 'Título, resumen y si pide fecha de nacimiento.' })
    @ApiResponse({ status: 404, description: 'ENLACE_INVALIDO.' })
    @ApiResponse({ status: 410, description: 'ENLACE_EXPIRADO.' })
    metadatos(@Param('token') token: string) {
        return this.service.metadatos(token);
    }

    @Post(':token/verify')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Verificar la fecha de nacimiento',
        description: 'Tres fallos bloquean el enlace 30 minutos. Si coincide, devuelve un JWT de 15 minutos.',
    })
    @ApiResponse({ status: 200, description: 'Token de acceso y su vencimiento.' })
    @ApiResponse({ status: 400, description: 'IDENTIDAD_NO_VALIDA.' })
    @ApiResponse({ status: 423, description: 'ENLACE_BLOQUEADO.' })
    verificar(@Param('token') token: string, @Body() dto: VerificarEnlaceDto) {
        return this.service.verificar(token, dto.fechaNacimiento);
    }

    @Get(':token/content')
    @ApiOperation({
        summary: 'Contenido del enlace',
        description: 'Si el comunicado pide identidad, exige el JWT corto en Authorization.',
    })
    @ApiResponse({ status: 200, description: 'Cuerpo y adjuntos.' })
    @ApiResponse({ status: 401, description: 'Falta confirmar la identidad.' })
    contenido(@Param('token') token: string, @Req() req: SolicitudCliente) {
        return this.service.contenido(token, autorizacionDe(req));
    }

    @Post(':token/acknowledge')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Confirmar desde el enlace',
        description: 'Canal ENLACE. El método es ENLACE_FECHA_NAC si pidió identidad, o ENLACE si no.',
    })
    @ApiResponse({ status: 200, description: 'confirmadoEn, version y canal.' })
    @ApiResponse({ status: 410, description: 'ENLACE_EXPIRADO.' })
    acusar(@Param('token') token: string, @Req() req: SolicitudCliente) {
        const ctx = contextoCliente(req);
        return this.service.acusar(token, { ip: ctx.ip, userAgent: ctx.userAgent, autorizacion: autorizacionDe(req) });
    }
}

function autorizacionDe(req: SolicitudCliente): string | undefined {
    const valor = req.headers?.authorization;
    return Array.isArray(valor) ? valor[0] : valor;
}
