import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EJEMPLO_ACUSE, EJEMPLO_KIOSCO } from '../housekeeping/ejemplos-swagger';
import { KioscoActual } from 'src/modules/kiosks/kiosk-auth/decorators/kiosco-actual.decorator';
import { KioskJwtAuthGuard } from 'src/modules/kiosks/kiosk-auth/guards/kiosk-jwt-auth.guard';
import { SesionKiosco } from 'src/modules/kiosks/kiosk-auth/kiosco-actual';
import { contextoCliente, SolicitudCliente } from '../me/cliente-http';
import { AcuseKioscoDto, PendientesKioscoQuery } from './dto/acuse-kiosco.dto';
import { KioskCommsService } from './kiosk-comms.service';

@ApiTags('Comunicación interna', 'Kiosk')
@ApiBearerAuth()
@UseGuards(KioskJwtAuthGuard)
@Controller('kiosk/comms')
export class KioskCommsController {
    constructor(private readonly service: KioskCommsService) {}

    @Get('pending')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Avisos del empleado en el kiosco',
        description: 'Hasta 3: avisos operativos vigentes y comunicados con acuse pendiente, si el canal KIOSCO está en sus canales.',
    })
    @ApiResponse({ status: 200, description: 'Lista corta, del más reciente al más antiguo.', schema: { example: EJEMPLO_KIOSCO } })
    @ApiResponse({ status: 401, description: 'Token de kiosco inválido.' })
    pendientes(@KioscoActual() kiosco: SesionKiosco, @Query() query: PendientesKioscoQuery) {
        return this.service.pendientes(kiosco, query.idEmpleado);
    }

    @Post(':id/acknowledge')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Confirmar en el kiosco',
        description: 'Solo si esa persona checó en este equipo en los últimos 5 minutos.',
    })
    @ApiBody({ schema: { example: { idEmpleado: 42, idRegistroAsistencia: 900 } } })
    @ApiResponse({ status: 200, description: 'confirmadoEn, version y canal KIOSCO.', schema: { example: { ...EJEMPLO_ACUSE, canal: 'KIOSCO' } } })
    @ApiResponse({ status: 409, description: 'CHECADA_NO_RECIENTE, ACUSE_NO_REQUERIDO o ESTADO_INVALIDO.' })
    acusar(
        @KioscoActual() kiosco: SesionKiosco,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: AcuseKioscoDto,
        @Req() req: SolicitudCliente,
    ) {
        const ctx = contextoCliente(req);
        return this.service.acusar(kiosco, id, dto, { ip: ctx.ip, userAgent: ctx.userAgent });
    }
}
