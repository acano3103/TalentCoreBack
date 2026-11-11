import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { KioscoActual } from '../kiosk-auth/decorators/kiosco-actual.decorator';
import { KioskJwtAuthGuard } from '../kiosk-auth/guards/kiosk-jwt-auth.guard';
import { SesionKiosco } from '../kiosk-auth/kiosco-actual';
import { HeartbeatKioskDto, QueryLookupEmpleadoDto, QueryRosterDto } from './dto/kiosk-device.dto';
import { KioskDeviceService } from './kiosk-device.service';

@ApiTags('Kiosk')
@ApiBearerAuth()
@UseGuards(KioskJwtAuthGuard)
@Controller('kiosk')
export class KioskDeviceController {
    constructor(private readonly device: KioskDeviceService) {}

    @Get('bootstrap')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Arranque del equipo',
        description: 'Kiosco, empresa, ubicaciones, políticas del equipo y umbrales globales.',
    })
    @ApiResponse({ status: 200, description: 'Paquete de arranque del kiosco.' })
    @ApiResponse({ status: 403, description: 'El equipo fue desactivado.' })
    bootstrap(@KioscoActual() kiosco: SesionKiosco) {
        return this.device.bootstrap(kiosco);
    }

    @Get('roster')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Padrón del kiosco',
        description: 'Empleados activos de las ubicaciones del equipo. Si la versión coincide, no reenvía la lista.',
    })
    @ApiResponse({ status: 200, description: 'Padrón completo o sin cambios.' })
    @ApiResponse({ status: 403, description: 'El equipo fue desactivado.' })
    roster(@KioscoActual() kiosco: SesionKiosco, @Query() query: QueryRosterDto) {
        return this.device.roster(kiosco, query.version);
    }

    @Get('employees/lookup')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Buscar empleado por número',
        description: 'Lo usa la tablet antes de checar. Los errores no incluyen datos del empleado.',
    })
    @ApiResponse({ status: 200, description: 'Empleado del padrón, con el tipo sugerido y el turno de hoy.' })
    @ApiResponse({ status: 404, description: 'EMPLEADO_NO_ENCONTRADO' })
    @ApiResponse({ status: 409, description: 'EMPLEADO_NO_ASIGNADO o EMPLEADO_INACTIVO' })
    lookup(@KioscoActual() kiosco: SesionKiosco, @Query() query: QueryLookupEmpleadoDto) {
        return this.device.lookup(kiosco, query.numero);
    }

    @Post('heartbeat')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Latido del equipo',
        description: 'Actualiza la última conexión, la versión de la app y las checadas pendientes.',
    })
    @ApiBody({ type: HeartbeatKioskDto })
    @ApiResponse({ status: 200, description: 'Versión del padrón y hora del servidor.' })
    @ApiResponse({ status: 403, description: 'El equipo fue desactivado.' })
    heartbeat(@KioscoActual() kiosco: SesionKiosco, @Body() dto: HeartbeatKioskDto) {
        return this.device.heartbeat(kiosco, dto);
    }
}
