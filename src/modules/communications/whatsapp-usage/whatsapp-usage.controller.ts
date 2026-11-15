import { Body, Controller, Get, Param, ParseIntPipe, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { SWAGGER_AUTH_DESCRIPTION } from 'src/constants/docs.constants';
import { ExcelExportService } from 'src/common/services/excel-export.service';
import { GetActiveUser } from 'src/modules/auth/decorators/active-user.decorator';
import { ActiveUserDto } from 'src/modules/auth/dto/active-user.dto';
import { CompanyTenantGuard } from 'src/modules/auth/guards/company-tenant.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CommsCapabilityGuard } from '../capabilities/comms-capability.guard';
import { RequireCapability } from '../capabilities/require-capability.decorator';
import { ActualizarTopeDto, MesesWhatsappQuery, ResumenWhatsappQuery } from './dto/whatsapp-usage.query';
import { WhatsappUsageService } from './whatsapp-usage.service';

@ApiTags('Comunicación interna')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyTenantGuard, CommsCapabilityGuard)
@RequireCapability('CFG_CANALES', 'COM_VER_ANALITICA')
@Controller('companies/:companyId/comms/whatsapp')
export class WhatsappUsageController {
    constructor(
        private readonly service: WhatsappUsageService,
        private readonly excel: ExcelExportService,
    ) {}

    @Get('usage/summary')
    @ApiOperation({
        summary: 'Resumen de consumo de WhatsApp',
        description: 'Mensajes, costo congelado, precio vigente y estado del tope. Solo el tenant de quien consulta.',
    })
    @ApiResponse({ status: 200, description: 'Resumen del mes.' })
    @ApiResponse({ status: 403, description: 'SIN_CAPACIDAD o FUERA_DE_ALCANCE.' })
    resumen(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: ResumenWhatsappQuery,
    ) {
        return this.service.resumen(activeUser, companyId, query);
    }

    @Get('usage/monthly')
    @ApiOperation({ summary: 'Consumo de WhatsApp por mes', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Serie mensual.' })
    mensual(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: MesesWhatsappQuery,
    ) {
        return this.service.mensual(activeUser, companyId, query.meses);
    }

    @Get('usage/breakdown')
    @ApiOperation({ summary: 'Consumo de WhatsApp por empresa', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Desglose del mes.' })
    desglose(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: ResumenWhatsappQuery,
    ) {
        return this.service.desglose(activeUser, companyId, query.mes);
    }

    @Get('usage/export')
    @ApiOperation({ summary: 'Exportar el consumo de WhatsApp', description: 'Excel del mes. El teléfono solo muestra los últimos 4 dígitos.' })
    @ApiResponse({ status: 200, description: 'Archivo de Excel.' })
    async exportar(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Query() query: ResumenWhatsappQuery,
        @Res() res: Response,
    ) {
        const datos = await this.service.filasExport(activeUser, companyId, query.mes);
        const buffer = await this.excel.generate({ sheetName: 'Consumo', columns: datos.columns, rows: datos.rows });
        this.excel.send(res, buffer, `Consumo_WhatsApp_${datos.mes}`);
    }

    @Get('cap')
    @ApiOperation({ summary: 'Tope de WhatsApp del tenant y de sus empresas', description: SWAGGER_AUTH_DESCRIPTION })
    @ApiResponse({ status: 200, description: 'Topes configurados.' })
    tope(@GetActiveUser() activeUser: ActiveUserDto, @Param('companyId', ParseIntPipe) companyId: number) {
        return this.service.obtenerTope(activeUser, companyId);
    }

    @Put('cap')
    @ApiOperation({
        summary: 'Guardar el tope de WhatsApp',
        description: 'Sin empresa, el tope aplica a todo el tenant. Con empresa, solo a esa. No reescribe el consumo ya registrado.',
    })
    @ApiResponse({ status: 200, description: 'Tope guardado.' })
    @ApiResponse({ status: 403, description: 'FUERA_DE_ALCANCE.' })
    guardarTope(
        @GetActiveUser() activeUser: ActiveUserDto,
        @Param('companyId', ParseIntPipe) companyId: number,
        @Body() dto: ActualizarTopeDto,
    ) {
        return this.service.guardarTope(activeUser, companyId, dto);
    }
}
