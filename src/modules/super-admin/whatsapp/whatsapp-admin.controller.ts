import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ExcelExportService } from 'src/common/services/excel-export.service';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { CrearPrecioDto, MesSuperadminQuery, PreciosQuery, TopeTenantDto } from './dto/precio-wa.dto';
import { WhatsappAdminService } from './whatsapp-admin.service';

@ApiTags('WhatsApp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('super-admin/whatsapp')
export class WhatsappAdminController {
    constructor(
        private readonly service: WhatsappAdminService,
        private readonly excel: ExcelExportService,
    ) {}

    @Get('usage/export')
    @ApiOperation({ summary: 'Exportar el consumo de WhatsApp de todos los tenants' })
    @ApiResponse({ status: 200, description: 'Archivo de Excel.' })
    async exportar(@Query() query: MesSuperadminQuery, @Res() res: Response) {
        const datos = await this.service.columnasExport(query.mes);
        const buffer = await this.excel.generate({ sheetName: 'Tenants', columns: datos.columns, rows: datos.rows });
        this.excel.send(res, buffer, `Consumo_WhatsApp_${datos.mes}`);
    }

    @Get('usage/:idTenant')
    @ApiOperation({ summary: 'Consumo de WhatsApp de un tenant' })
    @ApiResponse({ status: 200, description: 'Mensajes, precio, costo y desglose.' })
    @ApiResponse({ status: 404, description: 'NO_ENCONTRADO.' })
    usoTenant(@Param('idTenant', ParseIntPipe) idTenant: number, @Query() query: MesSuperadminQuery) {
        return this.service.usoTenant(idTenant, query.mes);
    }

    @Get('usage')
    @ApiOperation({
        summary: 'Consumo de WhatsApp de todos los tenants',
        description: 'Mensajes, precio vigente, costo congelado y porcentaje del tope. Cambiar un precio no recalcula el historial.',
    })
    @ApiResponse({ status: 200, description: 'Resumen por tenant.' })
    uso(@Query() query: MesSuperadminQuery) {
        return this.service.uso(query.mes);
    }

    @Get('prices')
    @ApiOperation({ summary: 'Historial de precios de WhatsApp', description: 'Cada versión queda VIGENTE, PROGRAMADO o HISTÓRICO.' })
    @ApiResponse({ status: 200, description: 'Versiones de precio.' })
    precios(@Query() query: PreciosQuery) {
        return this.service.precios(query.idTenant);
    }

    @Post('prices')
    @ApiOperation({
        summary: 'Crear una versión de precio',
        description: 'La vigencia es hoy o posterior. No edita ni borra versiones vigentes o pasadas, y no toca el WaConsumo ya registrado.',
    })
    @ApiResponse({ status: 201, description: 'Versión creada.' })
    @ApiResponse({ status: 400, description: 'CONTENIDO_INVALIDO.' })
    crearPrecio(@GetActiveUser() activeUser: ActiveUserDto, @Body() dto: CrearPrecioDto) {
        return this.service.crearPrecio(activeUser, dto);
    }

    @Put('caps/:idTenant')
    @ApiOperation({ summary: 'Guardar el tope de WhatsApp de un tenant o de una empresa' })
    @ApiResponse({ status: 200, description: 'Tope guardado.' })
    @ApiResponse({ status: 404, description: 'NO_ENCONTRADO.' })
    guardarTope(@Param('idTenant', ParseIntPipe) idTenant: number, @Body() dto: TopeTenantDto) {
        return this.service.guardarTope(idTenant, dto);
    }
}
