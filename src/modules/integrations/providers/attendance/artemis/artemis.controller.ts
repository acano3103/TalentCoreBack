import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { ArtemisService } from './artemis.service';
import { ArtemisClockInDto } from './dto/artemis-clock-in.dto';
import { ArtemisApiKeyGuard } from './guards/artemis-api-key.guard';
import { ArtemisDeviceItemDto } from './dto/artemis-device.dto';

@ApiTags('Artemis Attendance')
@ApiSecurity('x-api-key')
@UseGuards(ArtemisApiKeyGuard)
@Controller('integrations/attendance/artemis')
export class ArtemisController {
    constructor(private readonly artemisService: ArtemisService) { }

    // Endpoint llamado por el sistema de Artemis para registrar el acceso de un empleado
    @Post('clock-in')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Clock in employee for Artemis', description: 'Receives the digits marked by phone, checks that the employee exists and is active in the company.' })
    @ApiResponse({ status: 200, description: 'Employee clock in successfully.' })
    @ApiResponse({ status: 404, description: 'Employee not found or inactive.' })
    async clockIn(
        @Body() dto: ArtemisClockInDto
    ) {
        return this.artemisService.clockIn(dto);
    }

    // Endpoint para registrar o actualizar dispositivos desde Artemis
    @Post('devices')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Register or synchronize Artemis devices', description: 'Receives one or multiple devices from Artemis, creating or updating them in the database so they can be assigned to a site.', })
    @ApiBody({ type: ArtemisDeviceItemDto, description: 'Datos del dispositivo (se puede enviar como objeto individual o dentro de un arreglo JSON)', })
    @ApiResponse({ status: 200, description: 'Devices synchronized successfully.' })
    @ApiResponse({ status: 400, description: 'Invalid device payload or missing required fields.' })
    async syncDevices(
        @Body() body: ArtemisDeviceItemDto | ArtemisDeviceItemDto[]
    ) {
        const listaDispositivos = Array.isArray(body) ? body : [body];
        return this.artemisService.syncDevices(listaDispositivos);
    }
}